import * as THREE from 'three'
import { PRELUDE, VERT_QUAD, POINTS_PRELUDE, POINTS_FRAG } from './glsl.js'
import { getEffect } from '../effects/index.js'

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
    }
  }

  materialFor(type) {
    if (this.materials.has(type)) return this.materials.get(type)
    const def = getEffect(type)
    if (!def) return null

    const uniforms = this.baseUniforms()
    for (const [k, p] of Object.entries(def.params)) {
      uniforms['p_' + k] = { value: typeof p.default === 'boolean' ? (p.default ? 1 : 0) : Number(p.default) || 0 }
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
    for (const [k, p] of Object.entries(def.params)) {
      const key = 'p_' + k
      if (!u[key]) continue
      let v = params?.[k]
      if (v === undefined) v = p.default
      u[key].value = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0
    }
  }

  // ----------------------------------------------------------------- render
  /**
   * @param {object} project  { canvas:{w,h}, layers:[], globalEffects:[], fps }
   * @param {number} time     seconds
   * @param {object} opts     { width, height, target }  target=null -> screen
   */
  render(project, time, opts = {}) {
    const canvasW = project.canvas.w, canvasH = project.canvas.h
    const w = Math.max(2, Math.round(opts.width || canvasW))
    const h = Math.max(2, Math.round(opts.height || canvasH))
    const scale = w / canvasW
    const duration = project.duration || 1
    const progress = Math.min(1, Math.max(0, time / duration))

    const [rtA, rtB, rtComp, rtLayer, rtDepth] = this.ensureRTs(w, h, 5)
    const r = this.renderer
    r.setSize(w, h, false)

    // clear composite
    r.setRenderTarget(rtComp)
    r.setClearColor(0x000000, 0)
    r.clear(true, false, false)

    for (const layer of project.layers) {
      if (!layer.visible) continue
      const tex = this.getTexture(layer.id + ':color')
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
      r.setRenderTarget(rtLayer)
      r.setClearColor(0x000000, 0); r.clear(true, false, false)
      this.drawMesh(this.placeMesh)

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

      // ---- effect chain (ping-pong between rtA/rtB, source is rtLayer)
      let src = rtLayer
      let slot = 0
      const pool = [rtA, rtB]
      const ctx = { w, h, canvasW, canvasH, time, progress, scale, seed: layer.seed || 0 }

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
    const ctx = { w, h, canvasW, canvasH, time, progress, scale, seed: 0 }
    for (const fx of project.globalEffects || []) {
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
    r.setClearColor(0x111111, 1)
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

  /** Render one frame at full resolution and return a PNG blob. */
  async renderToBlob(project, time, width, height) {
    const rt = this.makeRT(width, height)
    this.render(project, time, { width, height, target: rt })
    const buf = new Uint8Array(width * height * 4)
    this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, buf)
    rt.dispose()

    // readPixels is bottom-up; flip into an ImageData
    const cv = document.createElement('canvas')
    cv.width = width; cv.height = height
    const ctx = cv.getContext('2d')
    const img = ctx.createImageData(width, height)
    const rowBytes = width * 4
    for (let y = 0; y < height; y++) {
      const s = (height - 1 - y) * rowBytes
      img.data.set(buf.subarray(s, s + rowBytes), y * rowBytes)
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
  return Object.keys(def.params).map((k) => `uniform float p_${k};`).join('\n') + '\n'
}
