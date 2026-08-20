// Starting points. A preset is just a function that builds layers/effects/keys
// through the normal store actions — nothing here is special-cased by the engine.
import chroma from 'chroma-js'

// chroma colour -> the [r,g,b] 0..1 triplet the colour params expect
const rgb01 = (c) => { const a = chroma(c).rgb(); return [a[0] / 255, a[1] / 255, a[2] / 255] }

function clearEffects(st, layerId) {
  const l = st.project.layers.find((x) => x.id === layerId)
  if (!l) return
  ;[...l.effects].forEach((f) => st.removeEffect(layerId, f.id))
}

function ensureGlobal(st, type) {
  const found = st.project.globalEffects.find((f) => f.type === type)
  return found ? found.id : st.addEffect('global', type)
}

function selected(st) {
  return st.ui.selectedLayer || st.project.layers.at(-1)?.id || null
}

export const PRESETS = {
  gardenReveal: {
    name: 'Garden reveal (scatter + emboss)',
    apply: (st) => {
      ensureGlobal(st, 'paper')
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const rev = st.addEffect(id, 'scatterReveal')
      st.setParam(id, rev, 'driver', 0)      // depth wave
      st.setParam(id, rev, 'scatter', 0.6)
      st.setParam(id, rev, 'softness', 0.12)
      const emb = st.addEffect(id, 'emboss')
      // reveal across the whole timeline
      st.clearKeys(`L:${id}:E:${rev}:progress`)
      st.addKey(`L:${id}:E:${rev}:progress`, 0, 0)
      st.addKey(`L:${id}:E:${rev}:progress`, st.project.duration * 0.85, 1.1)
    },
  },

  scanReveal: {
    name: 'Scan-line reveal',
    apply: (st) => {
      ensureGlobal(st, 'paper')
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const rev = st.addEffect(id, 'scatterReveal')
      st.setParam(id, rev, 'driver', 1)      // scan X
      st.setParam(id, rev, 'scatter', 0.45)
      st.setParam(id, rev, 'softness', 0.06)
      const emb = st.addEffect(id, 'emboss')
      st.clearKeys(`L:${id}:E:${rev}:progress`)
      st.addKey(`L:${id}:E:${rev}:progress`, 0, 0)
      st.addKey(`L:${id}:E:${rev}:progress`, st.project.duration * 0.9, 1.15)
    },
  },

  pointCloud: {
    name: 'Point cloud assembly',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const pc = st.addEffect(id, 'pointcloud')
      st.setParam(id, pc, 'density', 1100)
      st.setParam(id, pc, 'order', 0.85)
      st.setParam(id, pc, 'heat', 0.6)
      st.clearKeys(`L:${id}:E:${pc}:build`)
      st.addKey(`L:${id}:E:${pc}:build`, 0, 0)
      st.addKey(`L:${id}:E:${pc}:build`, st.project.duration * 0.6, 1.25)
    },
  },

  depthParallax: {
    name: 'Depth parallax (subtle)',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const d = st.addEffect(id, 'displace')
      st.setParam(id, d, 'amount', 24)
      st.setParam(id, d, 'amountY', 8)
      st.setParam(id, d, 'speed', 0.08)
    },
  },

  driftWall: {
    name: 'Slow drift wall',
    apply: (st) => {
      ensureGlobal(st, 'paper')
      const id = selected(st)
      if (!id) return
      const dr = st.addEffect(id, 'drift')
      st.setParam(id, dr, 'speedX', 12)
      st.setParam(id, dr, 'speedY', 0)
    },
  },

  travelGarden: {
    name: 'Traveling reveal (cursor)',
    apply: (st) => {
      ensureGlobal(st, 'paper')
      // every image: ghost embossed on the paper, revealed as the cursor passes
      for (const layer of st.project.layers) {
        ;[...layer.effects].forEach((f) => st.removeEffect(layer.id, f.id))
        const rev = st.addEffect(layer.id, 'scatterReveal')
        st.setParam(layer.id, rev, 'driver', 5)      // travel (cursor)
        st.setParam(layer.id, rev, 'scatter', 0.55)
        st.setParam(layer.id, rev, 'softness', 0.12)
        st.setParam(layer.id, rev, 'travelDur', 3)
        const emb = st.addEffect(layer.id, 'emboss')
      }
      // a straight left-to-right sweep across the whole duration, mid-height
      const dur = st.project.duration
      st.setCursor({ enabled: true, shape: 0, spread: 0.16 })
      ;((st.project.cursor && st.project.cursor.points) || []).slice().forEach((_, i, a) => st.removeCursorPoint(a.length - 1 - i))
      st.addCursorPoint(0, 0.02, 0.5)
      st.addCursorPoint(dur, 0.98, 0.5)
    },
  },

  // ---- experimental (fun branch) ----

  stagedGarden: {
    name: 'Staged reveal (paper→depth→colour)',
    apply: (st) => {
      ensureGlobal(st, 'paper')
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const rev = st.addEffect(id, 'scatterReveal')
      st.setParam(id, rev, 'driver', 0)
      st.setParam(id, rev, 'scatter', 0.55)
      st.setParam(id, rev, 'softness', 0.12)
      const emb = st.addEffect(id, 'emboss')
      st.setParam(id, emb, 'stages', true)     // the three-stage look
      st.clearKeys(`L:${id}:E:${rev}:progress`)
      st.addKey(`L:${id}:E:${rev}:progress`, 0, 0)
      st.addKey(`L:${id}:E:${rev}:progress`, st.project.duration * 0.9, 1.15)
    },
  },

  saberOutline: {
    name: 'Saber outline (energy glow)',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const s = st.addEffect(id, 'saber')
      st.setParam(id, s, 'keepImage', true)
      st.clearKeys(`L:${id}:E:${s}:draw`)
      st.addKey(`L:${id}:E:${s}:draw`, 0, 0)                       // draw the glow on L→R
      st.addKey(`L:${id}:E:${s}:draw`, st.project.duration * 0.8, 1.2)
      ensureGlobal(st, 'bloom')
    },
  },

  gilded: {
    name: 'Gilded (gold-leaf shimmer)',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      st.addEffect(id, 'goldLeaf')
      ensureGlobal(st, 'bloom')
    },
  },

  duotoneHeritage: {
    name: 'Duotone (heritage palette)',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const d = st.addEffect(id, 'duotone')
      // a 3-stop indigo→terracotta→gold ramp, sampled through chroma-js in Lab
      const pal = chroma.scale(['#141433', '#8a4a2f', '#f2d06b']).mode('lab')
      st.setParam(id, d, 'shadow', rgb01(pal(0.0)))
      st.setParam(id, d, 'mid', rgb01(pal(0.5)))
      st.setParam(id, d, 'high', rgb01(pal(1.0)))
    },
  },

  cursorReveal: {
    name: 'Cursor reveal (black emboss → colour)',
    apply: (st) => {
      ensureGlobal(st, 'paper')
      // every layer: black blind-emboss on the paper, staged into depth→colour as the cursor passes
      for (const layer of st.project.layers) {
        ;[...layer.effects].forEach((f) => st.removeEffect(layer.id, f.id))
        const rev = st.addEffect(layer.id, 'scatterReveal')
        st.setParam(layer.id, rev, 'driver', 5)       // travel (cursor)
        st.setParam(layer.id, rev, 'scatter', 0.5)
        st.setParam(layer.id, rev, 'softness', 0.12)
        st.setParam(layer.id, rev, 'travelDur', 3)
        const emb = st.addEffect(layer.id, 'emboss')
        st.setParam(layer.id, emb, 'tint', [0.05, 0.05, 0.06])   // black emboss
        st.setParam(layer.id, emb, 'stages', true)               // → depth → base → colour
      }
      const dur = st.project.duration
      st.setCursor({ enabled: true, shape: 0, spread: 0.18 })
      ;((st.project.cursor && st.project.cursor.points) || []).slice().forEach((_, i, a) => st.removeCursorPoint(a.length - 1 - i))
      st.addCursorPoint(0, 0.02, 0.5)
      st.addCursorPoint(dur, 0.98, 0.5)
    },
  },

  gradientWash: {
    name: 'Motion gradient (wash)',
    apply: (st) => {
      const id = ensureGlobal(st, 'gradient')
      st.setParam('global', id, 'screen', true)
      st.setParam('global', id, 'amount', 0.55)
    },
  },

  saberPulse: {
    name: 'Saber outline + audio pulse',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      const s = st.addEffect(id, 'saber')
      st.setParam(id, s, 'keepImage', true)
      st.setParam(id, s, 'audio', 1.6)          // bass pumps the glow (turn Audio ● on)
      st.clearKeys(`L:${id}:E:${s}:draw`)
      st.addKey(`L:${id}:E:${s}:draw`, 0, 0)
      st.addKey(`L:${id}:E:${s}:draw`, st.project.duration * 0.8, 1.2)
      ensureGlobal(st, 'bloom')
    },
  },

  filmFinish: {
    name: 'Film finish (grain + halation)',
    apply: (st) => { ensureGlobal(st, 'filmgrade') },
  },

  flow: {
    name: 'Flow field (points)',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      clearEffects(st, id)
      st.addEffect(id, 'flowfield')
    },
  },

  kineticType: {
    name: 'Kinetic type (fly in)',
    apply: (st) => {
      const id = selected(st)
      if (!id) return
      const l = st.project.layers.find((x) => x.id === id)
      const s = l?.transform.scale || 1
      const P = (p) => `L:${id}:T:${p}`
      for (const p of ['scale', 'y', 'opacity']) st.clearKeys(P(p))
      st.addKey(P('scale'), 0, s * 0.7); st.addKey(P('scale'), 1.2, s)
      st.addKey(P('y'), 0, 120); st.addKey(P('y'), 1.2, 0)
      st.addKey(P('opacity'), 0, 0); st.addKey(P('opacity'), 0.8, 1)
    },
  },

  kenBurns: {
    name: 'Ken Burns (slow push)',
    apply: (st) => {
      const dur = st.project.duration
      st.project.layers.forEach((l, i) => {
        const P = (p) => `L:${l.id}:T:${p}`
        const s = l.transform.scale || 1
        st.clearKeys(P('scale')); st.addKey(P('scale'), 0, s); st.addKey(P('scale'), dur, s * 1.12)
        const dx = (i % 2 ? 1 : -1) * 80
        st.clearKeys(P('x')); st.addKey(P('x'), 0, l.transform.x); st.addKey(P('x'), dur, l.transform.x + dx)
      })
    },
  },

  paradeGradient: {
    name: 'Parade + gradient wash',
    apply: (st) => {
      st.parade()
      const id = ensureGlobal(st, 'gradient')
      st.setParam('global', id, 'screen', true)
      st.setParam('global', id, 'amount', 0.4)
      ensureGlobal(st, 'bloom')
    },
  },
}
