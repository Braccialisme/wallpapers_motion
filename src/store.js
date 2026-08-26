import { create } from 'zustand'
import { defaultParams, getEffect } from './effects/index.js'

const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`

const DEFAULT_CURSOR = { enabled: false, shape: 0, spread: 0.16, softness: 0.5, falloff: 0.6, points: [] }

// backfill fields added after a project was saved, so old autosaves keep working
// drop keyframe tracks whose layer / effect no longer exists
export function pruneKeyframes(project) {
  const kf = { ...(project.keyframes || {}) }
  for (const path of Object.keys(kf)) {
    const p = path.split(':')
    if (p[0] === 'G') {
      if (!project.globalEffects.find((f) => f.id === p[2])) delete kf[path]
    } else {
      const layer = project.layers.find((l) => l.id === p[1])
      if (!layer) { delete kf[path]; continue }
      if (p[2] === 'E' && !layer.effects.find((f) => f.id === p[3])) delete kf[path]
    }
  }
  return kf
}

function migrate(p) {
  const proj = {
    duration: 20, fps: 24, globalEffects: [], keyframes: {},
    ...p,
    canvas: { w: 4550, h: 1000, ...(p.canvas || {}) },
    cursor: { ...DEFAULT_CURSOR, ...(p.cursor || {}) },
  }
  proj.keyframes = pruneKeyframes(proj)
  return proj
}

// keyframe path helpers -------------------------------------------------------
export const pathT = (layerId, prop) => `L:${layerId}:T:${prop}`
export const pathE = (layerId, fxId, param) => `L:${layerId}:E:${fxId}:${param}`
export const pathG = (fxId, param) => `G:E:${fxId}:${param}`

function lerp(a, b, t) {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => v + ((b[i] ?? v) - v) * t)
  return a + (b - a) * t
}
function ease(t) { return t * t * (3 - 2 * t) }

export function evalKeys(keys, t) {
  if (!keys || keys.length === 0) return undefined
  const k = [...keys].sort((a, b) => a.t - b.t)
  if (t <= k[0].t) return k[0].v
  if (t >= k[k.length - 1].t) return k[k.length - 1].v
  for (let i = 0; i < k.length - 1; i++) {
    if (t >= k[i].t && t <= k[i + 1].t) {
      const span = k[i + 1].t - k[i].t || 1
      const f = (t - k[i].t) / span
      return lerp(k[i].v, k[i + 1].v, k[i].hold ? 0 : ease(f))
    }
  }
  return k[k.length - 1].v
}

const newLayer = (over = {}) => ({
  id: uid('layer'),
  name: 'Layer',
  src: null, imgW: 0, imgH: 0,
  depthState: 'none',          // none | pending | luminance | model | imported
  visible: true,
  blend: 'normal',
  seed: Math.floor(Math.random() * 1000),
  transform: { x: 0, y: 0, scale: 1, rot: 0, opacity: 1 },
  effects: [],
  ...over,
})

export const useStore = create((set, get) => ({
  project: {
    name: 'wall',
    canvas: { w: 4550, h: 1000 },
    duration: 20,
    fps: 24,
    layers: [],
    globalEffects: [],
    keyframes: {},
    // traveling reveal cursor — a path the "brush" follows across the whole canvas
    cursor: {
      enabled: false,
      shape: 0,          // 0 circle · 1 brush · 2 dot
      spread: 0.16,      // brush radius, fraction of canvas height
      softness: 0.5,     // edge feather
      points: [],        // [{ t, x, y }]  x,y normalised 0..1 in canvas space
    },
  },
  ui: {
    time: 0, playing: false, loop: true,
    selectedLayer: null, selectedEffect: null,
    status: '', exporting: null,
    previewWidth: 1600,
    viewDepth: false,
    showHelp: false,
    showGuide: false,
    cursorEdit: false,
    selectedKey: null,
    wallSel: 0,        // which physical wall (3-wall master) is selected for cut / preview
    cutPreview: false, // preview the selected wall EXACTLY as it exports (frame-only, per wall)
  },
  // depth estimation settings (shared by every layer)
  depth: { model: 'small', source: 'relief', refine: true, radius: 8, eps: 0.02,
           reliefScale: 26, reliefGain: 1, invert: false },
  setDepth: (patch) => set((s) => ({ depth: { ...s.depth, ...patch } })),

  setUI: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),
  setProject: (patch) => set((s) => ({ project: { ...s.project, ...patch } })),
  setCanvas: (patch) => set((s) => ({ project: { ...s.project, canvas: { ...s.project.canvas, ...patch } } })),

  // ------------------------------------------------------------------ layers
  addLayer: (over) => {
    const l = newLayer(over)
    set((s) => ({
      project: { ...s.project, layers: [...s.project.layers, l] },
      ui: { ...s.ui, selectedLayer: l.id },
    }))
    return l.id
  },
  updateLayer: (id, patch) => set((s) => ({
    project: {
      ...s.project,
      layers: s.project.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    },
  })),
  updateTransform: (id, patch) => set((s) => ({
    project: {
      ...s.project,
      layers: s.project.layers.map((l) => (l.id === id ? { ...l, transform: { ...l.transform, ...patch } } : l)),
    },
  })),
  removeLayer: (id) => set((s) => {
    const kf = { ...s.project.keyframes }
    Object.keys(kf).forEach((p) => { if (p.startsWith(`L:${id}:`)) delete kf[p] })
    return {
      project: { ...s.project, layers: s.project.layers.filter((l) => l.id !== id), keyframes: kf },
      ui: { ...s.ui, selectedLayer: s.ui.selectedLayer === id ? null : s.ui.selectedLayer },
    }
  }),
  moveLayer: (id, dir) => set((s) => {
    const ls = [...s.project.layers]
    const i = ls.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ls.length) return {}
    ;[ls[i], ls[j]] = [ls[j], ls[i]]
    return { project: { ...s.project, layers: ls } }
  }),
  duplicateLayer: (id) => set((s) => {
    const src = s.project.layers.find((l) => l.id === id)
    if (!src) return {}
    const copy = { ...structuredClone({ ...src, effects: src.effects }), id: uid('layer'), name: src.name + ' copy' }
    copy.effects = copy.effects.map((e) => ({ ...e, id: uid('fx') }))
    return { project: { ...s.project, layers: [...s.project.layers, copy] } }
  }),

  // ----------------------------------------------------------------- effects
  addEffect: (target, type) => {
    const fx = { id: uid('fx'), type, enabled: true, params: defaultParams(type) }
    set((s) => {
      if (target === 'global') {
        return { project: { ...s.project, globalEffects: [...s.project.globalEffects, fx] },
                 ui: { ...s.ui, selectedEffect: fx.id } }
      }
      return {
        project: {
          ...s.project,
          layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: [...l.effects, fx] } : l)),
        },
        ui: { ...s.ui, selectedEffect: fx.id },
      }
    })
    return fx.id
  },
  updateEffect: (target, fxId, patch) => set((s) => {
    const up = (arr) => arr.map((f) => (f.id === fxId ? { ...f, ...patch } : f))
    if (target === 'global') return { project: { ...s.project, globalEffects: up(s.project.globalEffects) } }
    return { project: { ...s.project, layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: up(l.effects) } : l)) } }
  }),
  // Toggle every layer between the reveal/emboss look and plain photos. rawPhotos=true
  // disables scatterReveal+emboss on all layers (the white "ghost" vanishes, the placed
  // photo shows); toggling back re-enables them. Non-destructive — just the enabled flag.
  toggleRawPhotos: () => set((s) => {
    const raw = !s.ui.rawPhotos
    const HIDE = new Set(['scatterReveal', 'emboss'])
    const flip = (arr = []) => arr.map((f) => (HIDE.has(f.type) ? { ...f, enabled: !raw } : f))
    return {
      ui: { ...s.ui, rawPhotos: raw, status: raw ? 'showing plain photos (reveal off)' : 'reveal back on' },
      project: { ...s.project, layers: s.project.layers.map((l) => ({ ...l, effects: flip(l.effects) })) },
    }
  }),
  // PARADE: the thing the brief always wanted — 4 photos as one continuous filmstrip that
  // scrolls across the wall, so a new picture is always arriving and the wall is never empty
  // (never paper). Packs every visible layer full-height edge-to-edge into a strip (wider than
  // the wall), then gives each the SAME span-drift so the whole strip travels together. If the
  // images don't even fill the wall, they're scaled up so they do. Ghost (reveal/emboss) off.
  parade: () => set((s) => {
    const fw = s.project.canvas.w, fh = s.project.canvas.h
    const vis = s.project.layers.filter((l) => l.visible !== false)
    if (!vis.length) return {}
    let meta = vis.map((l) => { const ih = l.imgH || fh, iw = l.imgW || fw; const sc = fh / ih; return { id: l.id, sc, w: iw * sc } })
    let W = meta.reduce((a, m) => a + m.w, 0)
    if (W < fw && W > 0) { const boost = fw / W; meta = meta.map((m) => ({ ...m, sc: m.sc * boost, w: m.w * boost })); W = fw }  // fill wall width
    const travel = Math.max(0, (W - fw) / 2)   // how far the strip can slide while still covering the wall
    let x = -W / 2
    const posById = {}
    for (const m of meta) { posById[m.id] = { x: Math.round(x + m.w / 2), sc: m.sc }; x += m.w }
    const HIDE = new Set(['scatterReveal', 'emboss'])
    const layers = s.project.layers.map((l) => {
      const p = posById[l.id]
      // ghost off; drop any old drift (we scroll by keyframing the PLACEMENT, not a UV shift —
      // a UV drift can't reveal content that was clipped at the wall edge before effects run)
      let effects = (l.effects || []).filter((f) => f.type !== 'drift')
      effects = effects.map((f) => (HIDE.has(f.type) ? { ...f, enabled: false } : f))
      const t = l.transform
      return { ...l, transform: p ? { ...t, x: p.x, y: 0, scale: p.sc, clip: null } : { ...t, clip: null }, effects }
    })
    // scroll the whole strip by keyframing every layer's X: at t=0 shift the strip right so its
    // left edge sits on the wall's left edge; at t=end shift left so its right edge sits on the
    // wall's right edge. The strip is wider than the wall, so the wall is always fully covered.
    const dur = s.project.duration || 1
    const kf = { ...s.project.keyframes }
    for (const m of meta) {
      const p = posById[m.id]; if (!p) continue
      kf[pathT(m.id, 'x')] = [{ t: 0, v: p.x + travel }, { t: dur, v: p.x - travel }]
      delete kf[pathT(m.id, 'y')]   // keep it on the centre line
    }
    return { ui: { ...s.ui, rawPhotos: true, status: 'parade — packed filmstrip scrolling across the wall, no paper' },
             project: { ...s.project, layers, keyframes: kf } }
  }),
  // MOSAIC: pack the photos into a recursively-subdivided grid (binary space partition) —
  // "messy but not too much". Split the largest cell each step along its longer side at a
  // jittered ratio, one cell per visible layer, then cover-crop each image to fill its cell.
  // Cells tile the wall exactly -> no paper. Re-run to reshuffle.
  mosaic: () => set((s) => {
    const fw = s.project.canvas.w, fh = s.project.canvas.h
    // originals = real imports (drop any mosaic duplicates from a previous run so re-running
    // reshuffles instead of multiplying forever)
    const originals = s.project.layers.filter((l) => !l._mosaicDup)
    const N = originals.length
    if (!N) return {}
    const T = Math.min(18, Math.max(7, N * 3))   // MORE cuts than photos -> a busy collage
    // pool: keep the originals, then round-robin DUPLICATES (fresh ids) to fill the extra cells
    const pool = []
    for (let i = 0; i < T; i++) {
      const src = originals[i % N]
      pool.push(i < N ? src
        : { ...src, id: uid('layer'), _mosaicDup: true, effects: (src.effects || []).map((f) => ({ ...f, id: uid('fx') })) })
    }
    // messy recursive split: pick among the biggest few cells, jitter the ratio and the axis
    let rects = [{ x: -fw / 2, y: -fh / 2, w: fw, h: fh }]
    while (rects.length < T) {
      rects.sort((a, b) => b.w * b.h - a.w * a.h)
      const r = rects.splice(Math.floor(Math.random() * Math.min(rects.length, 3)), 1)[0]
      const ratio = 0.22 + Math.random() * 0.56               // strong jitter -> slivers + chunks
      const horiz = Math.random() < 0.6 ? r.w >= r.h : r.w > r.h   // mostly longer side, sometimes against
      if (horiz) { const w1 = r.w * ratio
        rects.push({ x: r.x, y: r.y, w: w1, h: r.h }, { x: r.x + w1, y: r.y, w: r.w - w1, h: r.h }) }
      else { const h1 = r.h * ratio
        rects.push({ x: r.x, y: r.y, w: r.w, h: h1 }, { x: r.x, y: r.y + h1, w: r.w, h: r.h - h1 }) }
    }
    // shuffle cells so the same photo's copies don't land next to each other
    for (let i = rects.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = rects[i]; rects[i] = rects[j]; rects[j] = t }
    const layers = pool.map((l, i) => {
      const r = rects[i]; const iw = l.imgW || fw, ih = l.imgH || fh
      const cx = Math.round(r.x + r.w / 2), cy = Math.round(r.y + r.h / 2)
      // cover-scale to fill the cell, then clip to the cell so it's a clean tile (no overflow)
      return { ...l, transform: { ...l.transform, x: cx, y: cy, scale: Math.max(r.w / iw, r.h / ih), clip: [cx, cy, r.w, r.h] } }
    })
    return { ui: { ...s.ui, status: `mosaic — ${T} cuts from ${N} photos (click to reshuffle)` },
             project: { ...s.project, layers } }
  }),

  // One control for the beige "depth" ghost colour across the whole project: set the emboss
  // 'tint' (the un-revealed / depth-relief colour) on every layer at once. Also remembered in
  // ui.depthColour so the global picker shows the current value.
  setDepthColour: (rgb) => set((s) => {
    const layers = s.project.layers.map((l) => ({
      ...l,
      effects: (l.effects || []).map((f) => (f.type === 'emboss' ? { ...f, params: { ...f.params, tint: rgb } } : f)),
    }))
    return { ui: { ...s.ui, depthColour: rgb }, project: { ...s.project, layers } }
  }),
  setParam: (target, fxId, key, value) => set((s) => {
    const up = (arr) => arr.map((f) => (f.id === fxId ? { ...f, params: { ...f.params, [key]: value } } : f))
    if (target === 'global') return { project: { ...s.project, globalEffects: up(s.project.globalEffects) } }
    return { project: { ...s.project, layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: up(l.effects) } : l)) } }
  }),
  removeEffect: (target, fxId) => set((s) => {
    const rm = (arr) => arr.filter((f) => f.id !== fxId)
    const kf = { ...s.project.keyframes }
    Object.keys(kf).forEach((p) => { if (p.includes(`:E:${fxId}:`)) delete kf[p] })
    if (target === 'global') return { project: { ...s.project, globalEffects: rm(s.project.globalEffects), keyframes: kf } }
    return { project: { ...s.project, keyframes: kf, layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: rm(l.effects) } : l)) } }
  }),
  // copy a layer's whole effect chain (settings + keyframes) to paste on another layer
  copyChain: (layerId) => set((s) => {
    const layer = s.project.layers.find((l) => l.id === layerId)
    if (!layer) return {}
    const effects = layer.effects.map((f) => {
      const keys = {}
      for (const param of Object.keys(f.params)) {
        const k = s.project.keyframes[pathE(layerId, f.id, param)]
        if (k) keys[param] = k.map((x) => ({ ...x }))
      }
      return { type: f.type, enabled: f.enabled, params: { ...f.params }, keys }
    })
    return { ui: { ...s.ui, fxClipboard: { effects } } }
  }),
  pasteChain: (layerId) => set((s) => {
    const clip = s.ui.fxClipboard
    if (!clip) return {}
    const keyframes = { ...s.project.keyframes }
    const added = clip.effects.map((e) => {
      const id = uid('fx')
      for (const [param, keys] of Object.entries(e.keys || {}))
        keyframes[pathE(layerId, id, param)] = keys.map((k) => ({ ...k }))
      return { id, type: e.type, enabled: e.enabled, params: { ...e.params } }
    })
    return { project: { ...s.project, keyframes,
      layers: s.project.layers.map((l) => (l.id === layerId ? { ...l, effects: [...l.effects, ...added] } : l)) } }
  }),

  pruneOrphanKeys: () => set((s) => ({ project: { ...s.project, keyframes: pruneKeyframes(s.project) } })),
  clearLayerEffects: (layerId) => set((s) => {
    const kf = { ...s.project.keyframes }
    Object.keys(kf).forEach((p) => { if (p.startsWith(`L:${layerId}:E:`)) delete kf[p] })
    return { project: { ...s.project, keyframes: kf,
      layers: s.project.layers.map((l) => (l.id === layerId ? { ...l, effects: [] } : l)) } }
  }),
  moveEffect: (target, fxId, dir) => set((s) => {
    const mv = (arr) => {
      const a = [...arr]; const i = a.findIndex((f) => f.id === fxId); const j = i + dir
      if (i < 0 || j < 0 || j >= a.length) return arr
      ;[a[i], a[j]] = [a[j], a[i]]; return a
    }
    if (target === 'global') return { project: { ...s.project, globalEffects: mv(s.project.globalEffects) } }
    return { project: { ...s.project, layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: mv(l.effects) } : l)) } }
  }),

  // --------------------------------------------------------------- keyframes
  addKey: (path, t, v) => set((s) => {
    const list = [...(s.project.keyframes[path] || [])].filter((k) => Math.abs(k.t - t) > 1e-4)
    list.push({ t, v })
    list.sort((a, b) => a.t - b.t)
    return { project: { ...s.project, keyframes: { ...s.project.keyframes, [path]: list } } }
  }),
  removeKey: (path, t) => set((s) => {
    const list = (s.project.keyframes[path] || []).filter((k) => Math.abs(k.t - t) > 1e-4)
    const kf = { ...s.project.keyframes }
    if (list.length) kf[path] = list; else delete kf[path]
    return { project: { ...s.project, keyframes: kf } }
  }),
  clearKeys: (path) => set((s) => {
    const kf = { ...s.project.keyframes }; delete kf[path]
    return { project: { ...s.project, keyframes: kf } }
  }),

  moveKey: (path, fromT, toT) => set((s) => {
    const list = (s.project.keyframes[path] || []).map((k) =>
      Math.abs(k.t - fromT) < 1e-4 ? { ...k, t: toT } : k)
    list.sort((a, b) => a.t - b.t)
    return { project: { ...s.project, keyframes: { ...s.project.keyframes, [path]: list } } }
  }),

  // ------------------------------------------------------------------ cursor
  setCursor: (patch) => set((s) => ({ project: { ...s.project, cursor: { ...DEFAULT_CURSOR, ...s.project.cursor, ...patch } } })),
  addCursorPoint: (t, x, y) => set((s) => {
    const cur = s.project.cursor || DEFAULT_CURSOR
    const pts = [...(cur.points || [])].filter((p) => Math.abs(p.t - t) > 1e-3)
    pts.push({ t, x, y }); pts.sort((a, b) => a.t - b.t)
    return { project: { ...s.project, cursor: { ...DEFAULT_CURSOR, ...cur, enabled: true, points: pts } } }
  }),
  updateCursorPoint: (i, patch) => set((s) => {
    const pts = s.project.cursor.points.map((p, j) => (j === i ? { ...p, ...patch } : p))
    pts.sort((a, b) => a.t - b.t)
    return { project: { ...s.project, cursor: { ...s.project.cursor, points: pts } } }
  }),
  removeCursorPoint: (i) => set((s) => ({
    project: { ...s.project, cursor: { ...s.project.cursor, points: s.project.cursor.points.filter((_, j) => j !== i) } },
  })),

    newProject: () => set(() => ({
    project: {
      name: 'wall',
      canvas: { w: 4550, h: 1000 },
      duration: 20, fps: 24,
      layers: [], globalEffects: [], keyframes: {},
      cursor: { ...DEFAULT_CURSOR },
    },
    ui: { ...get().ui, time: 0, playing: false, selectedLayer: null, cursorEdit: false },
  })),

    undo: () => { history.undo(get, set) },
  redo: () => { history.redo(get, set) },

  loadProject: (p) => set(() => ({ project: migrate(p), ui: { ...get().ui, time: 0, selectedLayer: p.layers[0]?.id ?? null } })),
}))

if (import.meta.env.DEV) window.useStore = useStore   // dev handle for debugging/inspection

// ------------------------------------------------------------------- undo/redo
// Snapshot the project before a change. Rapid changes within one gesture (a slider
// drag) coalesce into a single history step so one Ctrl+Z undoes the whole gesture.
const history = {
  past: [], future: [], last: 0, applying: false,
  record(prevProject) {
    if (this.applying) return
    const now = Date.now()
    if (now - this.last < 500 && this.past.length) return   // same gesture, skip
    this.past.push(prevProject)
    if (this.past.length > 120) this.past.shift()
    this.future = []
    this.last = now
  },
  undo(get, set) {
    if (!this.past.length) return
    this.applying = true
    this.future.push(get().project)
    set({ project: this.past.pop() })
    this.applying = false
    this.last = 0
  },
  redo(get, set) {
    if (!this.future.length) return
    this.applying = true
    this.past.push(get().project)
    set({ project: this.future.pop() })
    this.applying = false
    this.last = 0
  },
}
useStore.subscribe((s, prev) => {
  if (s.project !== prev.project) history.record(prev.project)
})

if (import.meta.env.DEV) window.__store = useStore   // handy in the console

/** Bake keyframes at time t -> a plain project the engine can render. */
// The combined 3-wall master (22050×1000) split into its physical walls. Widths match the
// single-wall canvas presets (8750, 8750, 4550).
// Physical arrangement: the small wall (4550) is the FRONT wall in the middle; the two large
// walls (8750) are Left and Right. Order across the 22050 run = Left | Front | Right.
export const WALLS_3 = [
  { name: 'Left · 8750', key: 'left', x0: 0, w: 8750 },
  { name: 'Front · 4550', key: 'front', x0: 8750, w: 4550 },
  { name: 'Right · 8750', key: 'right', x0: 13300, w: 8750 },
]

// Thematic-zone boundaries (normalised 0..1 across the full 22050 run), decoded from the
// scenography's shimmering_wall_layout.svg (8 zones for the thematic mapping). Shown as
// background guides so the composition lands on the right theme; NOT the export cut (that's
// the 3 physical walls, WALLS_3).
export const WALL_ZONES = [0, 0.0912, 0.1611, 0.2897, 0.4019, 0.6137, 0.8431, 0.9499, 1.0]

// Cut one wall out of the combined canvas for export: return a project whose canvas IS that
// wall (its native size), with everything shifted so the wall is centred. Pure data transform —
// the normal render path then renders it exactly, so preview and each cut stay identical.
export function deriveWall(project, wall) {
  const fw = project.canvas.w
  const dx = (wall.x0 + wall.w / 2) - fw / 2   // px to subtract so the wall centres on 0
  const sx0 = wall.x0 / fw, swn = wall.w / fw  // wall's slice in full-frame normalised coords
  const layers = project.layers.map((l) => {
    const t = l.transform
    const clip = t.clip ? [t.clip[0] - dx, t.clip[1], t.clip[2], t.clip[3]] : (t.clip ?? null)
    return { ...l, transform: { ...t, x: t.x - dx, clip } }
  })
  const keyframes = {}
  for (const [path, arr] of Object.entries(project.keyframes || {})) {
    keyframes[path] = /:T:x$/.test(path) ? arr.map((k) => ({ ...k, v: k.v - dx })) : arr
  }
  const cursor = project.cursor
    ? { ...project.cursor, points: (project.cursor.points || []).map((p) => ({ ...p, x: (p.x - sx0) / swn })) }
    : project.cursor
  return { ...project, canvas: { ...project.canvas, w: wall.w }, layers, keyframes, cursor }
}

export function resolveProject(project, t) {
  const kf = project.keyframes || {}
  const layers = project.layers.map((l) => {
    const transform = { ...l.transform }
    for (const p of ['x', 'y', 'scale', 'rot', 'opacity']) {
      const v = evalKeys(kf[pathT(l.id, p)], t)
      if (v !== undefined) transform[p] = v
    }
    const effects = l.effects.map((f) => {
      const def = getEffect(f.type)
      const params = { ...f.params }
      if (def) for (const key of Object.keys(def.params)) {
        const v = evalKeys(kf[pathE(l.id, f.id, key)], t)
        if (v !== undefined) params[key] = v
      }
      return { ...f, params }
    })
    return { ...l, transform, effects }
  })
  const globalEffects = project.globalEffects.map((f) => {
    const def = getEffect(f.type)
    const params = { ...f.params }
    if (def) for (const key of Object.keys(def.params)) {
      const v = evalKeys(kf[pathG(f.id, key)], t)
      if (v !== undefined) params[key] = v
    }
    return { ...f, params }
  })
  return { ...project, layers, globalEffects }
}

/** Interpolate the cursor path at time t (smooth Catmull-Rom), or null if no path. */
export function cursorAt(cursor, t) {
  const pts = cursor?.points || []
  if (pts.length === 0) return null
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y }
  if (t <= pts[0].t) return { x: pts[0].x, y: pts[0].y }
  const last = pts[pts.length - 1]
  if (t >= last.t) return { x: last.x, y: last.y }
  for (let i = 0; i < pts.length - 1; i++) {
    if (t >= pts[i].t && t <= pts[i + 1].t) {
      const f = (t - pts[i].t) / ((pts[i + 1].t - pts[i].t) || 1)
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1]
      const cr = (a, b, c, d) => {
        const f2 = f * f, f3 = f2 * f
        return 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3)
      }
      return { x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) }
    }
  }
  return { x: last.x, y: last.y }
}
