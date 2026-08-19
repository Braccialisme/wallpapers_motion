// Starting points. A preset is just a function that builds layers/effects/keys
// through the normal store actions — nothing here is special-cased by the engine.

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
}
