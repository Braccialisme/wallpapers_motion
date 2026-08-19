import { create } from 'zustand'
import { defaultParams, getEffect } from './effects/index.js'

const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}`

const DEFAULT_CURSOR = { enabled: false, shape: 0, spread: 0.16, softness: 0.5, points: [] }

// backfill fields added after a project was saved, so old autosaves keep working
function migrate(p) {
  return {
    duration: 20, fps: 24, globalEffects: [], keyframes: {},
    ...p,
    canvas: { w: 4550, h: 1000, ...(p.canvas || {}) },
    cursor: { ...DEFAULT_CURSOR, ...(p.cursor || {}) },
  }
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
  removeLayer: (id) => set((s) => ({
    project: { ...s.project, layers: s.project.layers.filter((l) => l.id !== id) },
    ui: { ...s.ui, selectedLayer: s.ui.selectedLayer === id ? null : s.ui.selectedLayer },
  })),
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
  setParam: (target, fxId, key, value) => set((s) => {
    const up = (arr) => arr.map((f) => (f.id === fxId ? { ...f, params: { ...f.params, [key]: value } } : f))
    if (target === 'global') return { project: { ...s.project, globalEffects: up(s.project.globalEffects) } }
    return { project: { ...s.project, layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: up(l.effects) } : l)) } }
  }),
  removeEffect: (target, fxId) => set((s) => {
    const rm = (arr) => arr.filter((f) => f.id !== fxId)
    if (target === 'global') return { project: { ...s.project, globalEffects: rm(s.project.globalEffects) } }
    return { project: { ...s.project, layers: s.project.layers.map((l) => (l.id === target ? { ...l, effects: rm(l.effects) } : l)) } }
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

    loadProject: (p) => set(() => ({ project: migrate(p), ui: { ...get().ui, time: 0, selectedLayer: p.layers[0]?.id ?? null } })),
}))

if (import.meta.env.DEV) window.__store = useStore   // handy in the console

/** Bake keyframes at time t -> a plain project the engine can render. */
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

/** Interpolate the cursor path to a position at time t, or null if no path. */
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
      return { x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f) }
    }
  }
  return { x: last.x, y: last.y }
}
