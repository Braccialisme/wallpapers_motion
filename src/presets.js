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
      st.setParam(id, emb, 'ghost', 0.55)
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
      st.setParam(id, emb, 'ghost', 0.5)
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
}
