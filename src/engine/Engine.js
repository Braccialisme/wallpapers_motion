import * as THREE from 'three'
import { PRELUDE, VERT_QUAD, POINTS_PRELUDE, POINTS_FRAG } from './glsl.js'
import { getEffect } from '../effects/index.js'
import { cursorAt } from '../store.js'

const VERT_PLACE = /* glsl */ `
uniform vec2  uHalfPx;    // half size of the quad in canvas px
uniform vec2  uPosPx;     // center offset in canvas px (y down)
uniform vec2  uCanvasPx;
uniform float uRot;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec2 p = position.xy * uHalfPx;
  float c = cos(uRot), s = sin(uRot);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  p += vec2(uPosPx.x, -uPosPx.y);
  gl_Position = vec4(p / uCanvasPx * 2.0, 0.0, 1.0);
}
`

const FRAG_BLIT = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform float uOpacity;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb, c.a * uOpacity);
}
`

const FRAG_DEPTH_PLACE = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }
`

// Debug view: show the layer's depth map in place, using the placed image for coverage.
const FRAG_DEPTHVIEW = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uDepth;
varying vec2 vUv;
void main(){
  float d = texture2D(uDepth, vUv).r;
  float a = texture2D(uTex, vUv).a;
  gl_FragColor = vec4(vec3(d), a);
}
`

// Mask a placed layer down to a rectangular cell (for the Mosaic layout). The cell is given
// in wall-centred pixels, y-down (same coords as transform.x/y); we map each fragment's world
// uv back into wall space through uFrameRect so preview (world) and export (frame) clip alike.
const FRAG_CLIP = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uCanvas;
uniform vec4 uFrameRect;
uniform vec4 uClip;         // cx, cy, cw, ch  (wall px, y-down, centred)
varying vec2 vUv;
void main(){
  vec2 fuv = (vUv - uFrameRect.xy) / uFrameRect.zw;
  float fw = uCanvas.x * uFrameRect.z, fh = uCanvas.y * uFrameRect.w;
  float wx = (fuv.x - 0.5) * fw;
  float wy = (0.5 - fuv.y) * fh;
  vec4 c = texture2D(uTex, vUv);
  if (wx < uClip.x - uClip.z * 0.5 || wx > uClip.x + uClip.z * 0.5 ||
      wy < uClip.y - uClip.w * 0.5 || wy > uClip.y + uClip.w * 0.5) c = vec4(0.0);
  gl_FragColor = c;
}
`

const BLEND = {
  normal: THREE.NormalBlending,
  add: THREE.AdditiveBlending,
  multiply: THREE.MultiplyBlending,
  screen: THREE.CustomBlending,
}

export default class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: true, premultipliedAlpha: false,
    })
    this.renderer.autoClear = false
    this.renderer.setPixelRatio(1)

    this.scene = new THREE.Scene()
    this.camera = new THREE.Camera()
    this.quad = new THREE.PlaneGeometry(2, 2)

    this.textures = new Map()   // key -> THREE.Texture
    this.materials = new Map()  // effectType -> ShaderMaterial
    this.pointGeo = new Map()   // density -> BufferGeometry
    this.splats = new Map()     // layerId -> { scene, cam, viewer, rt, ready }
    this.rts = []               // ping-pong pool
    this.errors = new Map()     // effectInstanceId -> message

    this.blitMat = new THREE.ShaderMaterial({
      vertexShader: VERT_QUAD, fragmentShader: FRAG_BLIT,
      uniforms: { uTex: { value: null }, uOpacity: { value: 1 } },
      transparent: true, depthTest: false, depthWrite: false,
    })
    this.blitMesh = new THREE.Mesh(this.quad, this.blitMat)

    this.placeMat = new THREE.ShaderMaterial({
      vertexShader: VERT_PLACE, fragmentShader: FRAG_BLIT,
      uniforms: {
        uTex: { value: null }, uOpacity: { value: 1 },
        uHalfPx: { value: new THREE.Vector2() }, uPosPx: { value: new THREE.Vector2() },
        uCanvasPx: { value: new THREE.Vector2() }, uRot: { value: 0 },
      },
      transparent: true, depthTest: false, depthWrite: false,
    })
    this.placeMesh = new THREE.Mesh(this.quad, this.placeMat)

    this.placeDepthMat = new THREE.ShaderMaterial({
      vertexShader: VERT_PLACE, fragmentShader: FRAG_DEPTH_PLACE,
      uniforms: {
        uTex: { value: null },
        uHalfPx: { value: new THREE.Vector2() }, uPosPx: { value: new THREE.Vector2() },
        uCanvasPx: { value: new THREE.Vector2() }, uRot: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    })
    this.placeDepthMesh = new THREE.Mesh(this.quad, this.placeDepthMat)

    this.depthViewMat = new THREE.ShaderMaterial({
      vertexShader: VERT_QUAD, fragmentShader: FRAG_DEPTHVIEW,
      uniforms: { uTex: { value: null }, uDepth: { value: null } },
      transparent: true, depthTest: false, depthWrite: false,
    })

    this.clipMat = new THREE.ShaderMaterial({
      vertexShader: VERT_QUAD, fragmentShader: FRAG_CLIP,
      uniforms: {
        uTex: { value: null }, uCanvas: { value: new THREE.Vector2() },
        uFrameRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uClip: { value: new THREE.Vector4() },
      },
      transparent: true, depthTest: false, depthWrite: false,
    })
  }

  // ---------------------------------------------------------------- resources
  setTexture(key, tex) {
    const prev = this.textures.get(key)
    if (prev && prev !== tex) prev.dispose()
    this.textures.set(key, tex)
  }
  getTexture(key) { return this.textures.get(key) || null }

  makeRT(w, h) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: false, stencilBuffer: false,
    })
  }

  ensureRTs(w, h, n = 5) {
    if (this.rtW !== w || this.rtH !== h) {
      this.rts.forEach((rt) => rt.dispose())
      this.rts = []
      this.rtW = w; this.rtH = h
    }
    while (this.rts.length < n) this.rts.push(this.makeRT(w, h))
    return this.rts
  }

  // Build a canvas-space map of WHEN the cursor brush first reached each pixel.
  // Computed on the CPU from the path (short), cached by a signature, uploaded as a
  // float texture. The reveal shader turns (uTime - touchTime) into a local wavefront,
  // so a pixel stays revealed once the brush has passed — that is the trail.
  ensureTouchMap(project) {
    const cur = project.cursor
    const pts = cur?.points || []
    const sig = JSON.stringify({ e: cur?.enabled, s: cur?.spread, sh: cur?.shape, p: pts, d: project.duration,
                                 c: [project.canvas.w, project.canvas.h] })
    if (sig === this._touchSig) return this.touchTex
    this._touchSig = sig

    if (this.touchTex) { this.touchTex.dispose(); this.touchTex = null }
    if (!cur?.enabled || pts.length < 1) return null

    const aspect = project.canvas.w / project.canvas.h
    // resolution scaled to the wall — 512 was too coarse and showed stair-stepping
    const TW = Math.min(2048, Math.max(768, Math.round(project.canvas.w / 3)))
    const TH = Math.max(2, Math.round(TW / aspect))
    const buf = new Float32Array(TW * TH).fill(1e9)   // 1e9 = never touched
    const rad = Math.max(0.01, cur.spread)
    const shapeScale = cur.shape === 2 ? 0.45 : 1      // dot is tighter
    const r = rad * shapeScale
    const fall = cur.falloff ?? 0.6
    // stamp a soft ramp OUT to rEdge: pixels past the core resolve progressively later,
    // so the brush edge feathers instead of hard-cutting (that was the "stairs").
    const rEdge = r * (1 + Math.min(1.2, fall))

    const t0 = pts[0].t, t1 = pts[pts.length - 1].t
    const N = 700
    for (let sIdx = 0; sIdx <= N; sIdx++) {
      const t = t1 > t0 ? t0 + ((t1 - t0) * sIdx) / N : t0
      const pos = cursorAt(cur, t)
      if (!pos) continue
      const cxp = pos.x, cyp = pos.y
      const x0 = Math.max(0, Math.floor((cxp - rEdge / aspect) * TW))
      const x1 = Math.min(TW - 1, Math.ceil((cxp + rEdge / aspect) * TW))
      const y0 = Math.max(0, Math.floor((cyp - rEdge) * TH))
      const y1 = Math.min(TH - 1, Math.ceil((cyp + rEdge) * TH))
      for (let py = y0; py <= y1; py++) {
        const uy = (py + 0.5) / TH
        for (let px = x0; px <= x1; px++) {
          const ux = (px + 0.5) / TW
          const dx = (ux - cxp) * aspect, dy = uy - cyp
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist <= rEdge) {
            // 0 at centre -> ramps up through the core and keeps ramping in the soft rim
            const tt = t + fall * (dist / r)
            const i = py * TW + px
            if (tt < buf[i]) buf[i] = tt
          }
        }
      }
      if (t1 === t0) break
    }

    const flipped = new Float32Array(buf.length)
    for (let y = 0; y < TH; y++) flipped.set(buf.subarray((TH - 1 - y) * TW, (TH - y) * TW), y * TW)
    const tex = new THREE.DataTexture(flipped, TW, TH, THREE.RedFormat, THREE.FloatType)
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true
    this.touchTex = tex
    return tex
  }

  // Load a Gaussian-splat scene (.ply/.ksplat/.splat/.spz) for a splat layer. It renders into
  // an offscreen RT each frame (see render()), which is then used as the layer's texture.
  async loadSplat(layerId, url, fmt) {
    const G = await import('@mkkellogg/gaussian-splats-3d')
    const FMT = { ply: G.SceneFormat.Ply, ksplat: G.SceneFormat.KSplat, splat: G.SceneFormat.Splat, spz: G.SceneFormat.Spz }
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
    const viewer = new G.DropInViewer({ gpuAcceleratedSort: false, sharedMemoryForWorkers: false })
    scene.add(viewer)
    const rt = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false,
    })
    const entry = { scene, cam, viewer, rt, ready: false }
    this.removeSplat(layerId)
    this.splats.set(layerId, entry)
    try {
      await viewer.addSplatScene(url, { showLoadingUI: false, progressiveLoad: false, format: FMT[fmt] })
      entry.ready = true
    } catch (e) { console.warn('[splat] load failed', e?.message || e) }
    return entry
  }

  removeSplat(layerId) {
    const sp = this.splats.get(layerId)
    if (!sp) return
    try { sp.viewer?.dispose?.() } catch {}
    try { sp.rt?.dispose() } catch {}
    this.splats.delete(layerId)
  }

  pointGeometry(density) {
    const d = Math.max(8, Math.min(2048, Math.round(density)))
    if (this.pointGeo.has(d)) return this.pointGeo.get(d)
    const n = d * d
    const arr = new Float32Array(n * 2)
    const pos = new Float32Array(n * 3)
    let i = 0
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        arr[i * 2] = (x + 0.5) / d
        arr[i * 2 + 1] = (y + 0.5) / d
        i++
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aUv', new THREE.BufferAttribute(arr, 2))
    this.pointGeo.set(d, g)
    return g
  }

  // ------------------------------------------------------------- materials
  baseUniforms() {
    return {
      uTex: { value: null }, uDepth: { value: null },
      uRes: { value: new THREE.Vector2() }, uCanvas: { value: new THREE.Vector2() },
      uTime: { value: 0 }, uProgress: { value: 0 }, uScale: { value: 1 }, uSeed: { value: 0 },
      uTouch: { value: null }, uHasTouch: { value: 0 }, uCover: { value: null },
      uFrameRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uAudio: { value: 0 }, uAudioLow: { value: 0 }, uAudioMid: { value: 0 }, uAudioHigh: { value: 0 },
    }
  }

  materialFor(type) {
    if (this.materials.has(type)) return this.materials.get(type)
    const def = getEffect(type)
    if (!def) return null

    const uniforms = this.baseUniforms()
    for (const [k, p] of Object.entries(def.params)) {
      uniforms['p_' + k] = p.type === 'color'
        ? { value: new THREE.Vector3(...(p.default || [1, 1, 1])) }
        : { value: typeof p.default === 'boolean' ? (p.default ? 1 : 0) : Number(p.default) || 0 }
    }

    let mat
    if (def.kind === 'points') {
      mat = new THREE.ShaderMaterial({
        vertexShader: POINTS_PRELUDE + paramDecls(def) + def.vert,
        fragmentShader: POINTS_FRAG,
        uniforms, transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.NormalBlending,
      })
    } else {
      mat = new THREE.ShaderMaterial({
        vertexShader: VERT_QUAD,
        fragmentShader: PRELUDE + paramDecls(def) + def.frag,
        uniforms, transparent: true, depthTest: false, depthWrite: false,
      })
    }
    this.materials.set(type, mat)
    return mat
  }

  applyUniforms(mat, def, params, ctx) {
    const u = mat.uniforms
    u.uRes.value.set(ctx.w, ctx.h)
    u.uCanvas.value.set(ctx.canvasW, ctx.canvasH)
    u.uTime.value = ctx.time
    u.uProgress.value = ctx.progress
    u.uScale.value = ctx.scale
    u.uSeed.value = ctx.seed || 0
    if (u.uTouch) u.uTouch.value = ctx.touchTex || null
    if (u.uHasTouch) u.uHasTouch.value = ctx.touchTex ? 1 : 0
    if (u.uCover) u.uCover.value = ctx.coverTex || null
    if (u.uFrameRect && ctx.frameRect) u.uFrameRect.value.set(ctx.frameRect[0], ctx.frameRect[1], ctx.frameRect[2], ctx.frameRect[3])
    const a = this.audio || {}
    if (u.uAudio) u.uAudio.value = a.level || 0
    if (u.uAudioLow) u.uAudioLow.value = a.low || 0
    if (u.uAudioMid) u.uAudioMid.value = a.mid || 0
    if (u.uAudioHigh) u.uAudioHigh.value = a.high || 0
    for (const [k, p] of Object.entries(def.params)) {
      const key = 'p_' + k
      if (!u[key]) continue
      let v = params?.[k]
      if (v === undefined) v = p.default
      if (p.type === 'color') {
        const c = Array.isArray(v) ? v : [1, 1, 1]
        u[key].value.set(c[0] ?? 1, c[1] ?? 1, c[2] ?? 1)
      } else {
        u[key].value = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0
      }
    }
  }

  // ----------------------------------------------------------------- render
  /**
   * @param {object} project  { canvas:{w,h}, layers:[], globalEffects:[], fps }
   * @param {number} time     seconds
   * @param {object} opts     { width, height, target }  target=null -> screen
   */
  render(project, time, opts = {}) {
    const fw = project.canvas.w, fh = project.canvas.h            // the export FRAME
    // preview renders a WORLD larger than the frame (a plan de travail) so layers can be
    // parked in the surround; export renders the frame only (frameOnly:true, margin 0).
    // padX (wall px): render a wall PLUS horizontal padding so a photo whose centre sits in
    // the neighbour wall isn't clipped at the wall edge before its effects run (that clipping
    // is what made straddling images vanish to grey on cut export). The frame is the wall
    // region inside the padded canvas; renderToBlob then crops the output to the wall.
    const padX = opts.padX || 0
    let canvasW, canvasH, frameRect
    if (padX > 0) {
      canvasW = Math.round(fw + 2 * padX); canvasH = fh
      frameRect = [padX / canvasW, 0, fw / canvasW, 1]
    } else {
      const m = opts.frameOnly ? 0 : (project.canvas.margin ?? 1.0)
      canvasW = Math.round(fw * (1 + 2 * m)); canvasH = Math.round(fh * (1 + 2 * m))
      const fr = m > 0 ? m / (1 + 2 * m) : 0, frs = 1 / (1 + 2 * m)
      frameRect = [fr, fr, frs, frs]
    }
    const w = Math.max(2, Math.round(opts.width || canvasW))
    const h = Math.max(2, Math.round(opts.height || canvasH))
    const scale = w / canvasW
    const duration = project.duration || 1
    const progress = Math.min(1, Math.max(0, time / duration))

    const [rtA, rtB, rtComp, rtLayer, rtDepth] = this.ensureRTs(w, h, 5)
    const touchTex = this.ensureTouchMap(project)
    const r = this.renderer
    r.setSize(w, h, false)

    // clear composite
    r.setRenderTarget(rtComp)
    r.setClearColor(0x000000, 0)
    r.clear(true, false, false)

    for (const layer of project.layers) {
      if (!layer.visible) continue
      let tex = this.getTexture(layer.id + ':color')
      // a gaussian-splat layer renders its 3D scene to an offscreen RT each frame; from there
      // it flows through the normal pipeline (place / effects / clip / composite) like a photo
      if (layer.kind === 'splat') {
        const sp = this.splats.get(layer.id)
        if (!sp || !sp.ready) continue
        const s = layer.splat || {}
        const dist = s.dist ?? 4, orbit = s.orbit ?? 0.15, sway = s.sway ?? 0.3, pitch = s.pitch ?? 0.2
        const yaw = (s.yaw ?? 0) + Math.sin(time * orbit) * sway
        sp.cam.position.set(Math.sin(yaw) * dist, pitch * dist, Math.cos(yaw) * dist)
        sp.cam.lookAt(0, 0, 0)
        sp.cam.updateProjectionMatrix()
        r.setRenderTarget(sp.rt)
        r.setClearColor(0x000000, 0); r.clear(true, true, false)
        try { r.render(sp.scene, sp.cam) } catch (e) { /* splat worker still warming up */ }
        tex = sp.rt.texture
      }
      if (!tex) continue
      const depthTex = this.getTexture(layer.id + ':depth')

      const iw = layer.imgW || tex.image?.width || canvasW
      const ih = layer.imgH || tex.image?.height || canvasH
      const t = layer.transform
      const halfW = (iw * t.scale) / 2, halfH = (ih * t.scale) / 2

      // ---- place image (own pixel ratio, never stretched) into canvas space
      const pm = this.placeMat.uniforms
      pm.uTex.value = tex
      pm.uOpacity.value = 1
      pm.uHalfPx.value.set(halfW, halfH)
      pm.uPosPx.value.set(t.x, t.y)
      pm.uCanvasPx.value.set(canvasW, canvasH)
      pm.uRot.value = (t.rot || 0) * Math.PI / 180
      const clip = t.clip
      if (clip) {
        // place into a temp, then mask down to the cell rectangle
        r.setRenderTarget(rtA)
        r.setClearColor(0x000000, 0); r.clear(true, false, false)
        this.drawMesh(this.placeMesh)
        const cu = this.clipMat.uniforms
        cu.uTex.value = rtA.texture
        cu.uCanvas.value.set(canvasW, canvasH)
        cu.uFrameRect.value.set(frameRect[0], frameRect[1], frameRect[2], frameRect[3])
        cu.uClip.value.set(clip[0], clip[1], clip[2], clip[3])
        r.setRenderTarget(rtLayer)
        r.setClearColor(0x000000, 0); r.clear(true, false, false)
        this.blitMesh.material = this.clipMat
        this.drawMesh(this.blitMesh)
        this.blitMesh.material = this.blitMat
      } else {
        r.setRenderTarget(rtLayer)
        r.setClearColor(0x000000, 0); r.clear(true, false, false)
        this.drawMesh(this.placeMesh)
      }

      // ---- place depth with the identical transform
      r.setRenderTarget(rtDepth)
      r.setClearColor(0x000000, 1); r.clear(true, false, false)
      if (depthTex) {
        const dm = this.placeDepthMat.uniforms
        dm.uTex.value = depthTex
        dm.uHalfPx.value.copy(pm.uHalfPx.value)
        dm.uPosPx.value.copy(pm.uPosPx.value)
        dm.uCanvasPx.value.copy(pm.uCanvasPx.value)
        dm.uRot.value = pm.uRot.value
        this.drawMesh(this.placeDepthMesh)
      }

      // ---- depth inspection: show the depth map instead of the picture
      if (opts.viewDepth) {
        this.depthViewMat.uniforms.uTex.value = rtLayer.texture
        this.depthViewMat.uniforms.uDepth.value = rtDepth.texture
        this.blitMesh.material = this.depthViewMat
        r.setRenderTarget(rtComp)
        this.drawMesh(this.blitMesh)
        this.blitMesh.material = this.blitMat
        continue
      }

      // ---- effect chain (ping-pong between rtA/rtB, source is rtLayer)
      let src = rtLayer
      let slot = 0
      const pool = [rtA, rtB]
      const ctx = { w, h, canvasW, canvasH, time, progress, scale, seed: layer.seed || 0, touchTex, coverTex: rtLayer.texture, frameRect }

      for (const fx of layer.effects || []) {
        const dst = pool[slot % 2]
        if (!fx.enabled) continue
        const def = getEffect(fx.type)
        if (!def) continue
        const mat = this.materialFor(fx.type)
        if (!mat) continue
        this.applyUniforms(mat, def, fx.params, ctx)
        mat.uniforms.uTex.value = src.texture
        mat.uniforms.uDepth.value = rtDepth.texture

        r.setRenderTarget(dst)
        r.setClearColor(0x000000, 0); r.clear(true, false, false)

        try {
          if (def.kind === 'points') {
            const geo = this.pointGeometry(fx.params?.density ?? 900)
            if (!this._points) this._points = new THREE.Points(geo, mat)
            this._points.geometry = geo
            this._points.material = mat
            this._points.frustumCulled = false
            this.drawMesh(this._points)
          } else {
            this.blitMesh.material = mat
            this.drawMesh(this.blitMesh)
            this.blitMesh.material = this.blitMat
          }
          this.errors.delete(fx.id)
        } catch (e) {
          this.errors.set(fx.id, String(e.message || e))
        }

        src = dst
        slot++
      }

      // ---- composite layer onto canvas
      this.blitMat.uniforms.uTex.value = src.texture
      this.blitMat.uniforms.uOpacity.value = t.opacity ?? 1
      this.blitMat.blending = BLEND[layer.blend] ?? THREE.NormalBlending
      if (layer.blend === 'screen') {
        this.blitMat.blendSrc = THREE.OneFactor
        this.blitMat.blendDst = THREE.OneMinusSrcColorFactor
        this.blitMat.blendEquation = THREE.AddEquation
      }
      r.setRenderTarget(rtComp)
      this.drawMesh(this.blitMesh, false)
      this.blitMat.blending = THREE.NormalBlending
    }

    // ---- global chain on the composite
    let src = rtComp
    let gslot = 0
    const gpool = [rtA, rtB]
    const ctx = { w, h, canvasW, canvasH, time, progress, scale, seed: 0, touchTex, frameRect }
    for (const fx of opts.viewDepth ? [] : project.globalEffects || []) {
      if (!fx.enabled) continue
      const def = getEffect(fx.type)
      if (!def || def.kind === 'points') continue
      const mat = this.materialFor(fx.type)
      this.applyUniforms(mat, def, fx.params, ctx)
      mat.uniforms.uTex.value = src.texture
      mat.uniforms.uDepth.value = rtDepth.texture
      const dst = gpool[gslot % 2]
      r.setRenderTarget(dst)
      r.setClearColor(0x000000, 0); r.clear(true, false, false)
      this.blitMesh.material = mat
      this.drawMesh(this.blitMesh)
      this.blitMesh.material = this.blitMat
      src = dst
      gslot++
    }

    // ---- present
    const target = opts.target ?? null
    r.setRenderTarget(target)
    r.setClearColor(0x0a0a0b, 1)   // dark pasteboard void
    r.clear(true, false, false)
    this.blitMat.uniforms.uTex.value = src.texture
    this.blitMat.uniforms.uOpacity.value = 1
    this.drawMesh(this.blitMesh)

    return src
  }

  drawMesh(mesh, clearScene = true) {
    this.scene.clear()
    this.scene.add(mesh)
    this.renderer.render(this.scene, this.camera)
    this.scene.clear()
  }

  /**
   * Render one frame at full resolution and return a PNG blob.
   * opts.padX (wall px): render the wall inside a padded canvas so photos straddling the wall
   * edge aren't clipped before effects, then crop the output back to the wall (fixes the grey
   * strips on cut export). Capped so the padded canvas stays under the GPU texture limit.
   */
  async renderToBlob(project, time, width, height, opts = {}) {
    let padX = opts.padX || 0
    if (padX > 0) padX = Math.min(padX, Math.floor((16000 - width) / 2))   // stay under the texture cap
    if (padX < 0) padX = 0
    const rw = width + 2 * padX          // render width (padded), height unchanged
    const rt = this.makeRT(rw, height)
    this.render(project, time, { width: rw, height, target: rt, frameOnly: padX === 0, padX })
    const buf = new Uint8Array(rw * height * 4)
    this.renderer.readRenderTargetPixels(rt, 0, 0, rw, height, buf)
    rt.dispose()

    // readPixels is bottom-up; flip AND crop the centre (the wall) into an ImageData
    const cv = document.createElement('canvas')
    cv.width = width; cv.height = height
    const ctx = cv.getContext('2d')
    const img = ctx.createImageData(width, height)
    const srcRow = rw * 4, dstRow = width * 4, xoff = padX * 4
    for (let y = 0; y < height; y++) {
      const s = (height - 1 - y) * srcRow + xoff
      img.data.set(buf.subarray(s, s + dstRow), y * dstRow)
    }
    ctx.putImageData(img, 0, 0)
    return await new Promise((res) => cv.toBlob(res, 'image/png'))
  }

  dispose() {
    this.rts.forEach((rt) => rt.dispose())
    this.textures.forEach((t) => t.dispose())
    this.materials.forEach((m) => m.dispose())
    this.renderer.dispose()
  }
}

function paramDecls(def) {
  return Object.entries(def.params)
    .map(([k, p]) => `uniform ${p.type === 'color' ? 'vec3' : 'float'} p_${k};`)
    .join('\n') + '\n'
}
