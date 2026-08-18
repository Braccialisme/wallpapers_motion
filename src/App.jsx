import React, { useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { useStore, resolveProject } from './store.js'
import { estimateDepth, depthTexture, depthFromLuminance } from './engine/depth.js'
import { exportVideo, exportStill } from './engine/exporter.js'
import { PRESETS } from './presets.js'
import Viewport from './ui/Viewport.jsx'
import LayersPanel from './ui/LayersPanel.jsx'
import Inspector from './ui/Inspector.jsx'
import Timeline from './ui/Timeline.jsx'
import { useShortcuts, HelpModal } from './ui/Shortcuts.jsx'

const readDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = rej
  r.readAsDataURL(file)
})

const loadImage = (src) => new Promise((res, rej) => {
  const im = new Image()
  im.onload = () => res(im)
  im.onerror = rej
  im.src = src
})

const makeTexture = (img) => {
  const tex = new THREE.Texture(img)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

// Estimated depth survives engine recreation (HMR, WebGL context loss) and project
// reloads within a session, so we never pay for the model twice.
const depthCache = new Map()   // layerId -> {data,width,height}

export default function App() {
  const engineRef = useRef(null)
  const { project, ui } = useStore()
  const setUI = useStore((s) => s.setUI)
  const addLayer = useStore((s) => s.addLayer)
  const updateLayer = useStore((s) => s.updateLayer)
  const updateTransform = useStore((s) => s.updateTransform)
  const addEffect = useStore((s) => s.addEffect)
  const loadProject = useStore((s) => s.loadProject)
  const [busy, setBusy] = useState(false)
  const [engineEpoch, setEngineEpoch] = useState(0)   // bumps whenever a new engine is created
  useShortcuts()

  // default ground so the canvas is never a black void for the team
  useEffect(() => {
    if (useStore.getState().project.globalEffects.length === 0) addEffect('global', 'paper')
  }, [])

  // Textures live on the GPU inside the engine. If the engine is ever recreated
  // (HMR, WebGL context loss) they vanish while the project still lists the layers.
  // Every layer carries its image inline, so rebuild anything that went missing.
  const layerSig = project.layers.map((l) => l.id + ':' + (l.src ? 1 : 0)).join('|')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const engine = engineRef.current
      if (!engine) return
      for (const l of useStore.getState().project.layers) {
        if (cancelled || !l.src) continue
        if (engine.getTexture(l.id + ':color')) continue
        try {
          const img = await loadImage(l.src)
          if (cancelled) return
          engine.setTexture(l.id + ':color', makeTexture(img))
          const cached = depthCache.get(l.id)
          engine.setTexture(l.id + ':depth', depthTexture(cached || depthFromLuminance(img)))
          if (!cached && l.depthState === 'model') runDepth(l.id)
        } catch { /* skip a broken image rather than breaking the app */ }
      }
    })()
    return () => { cancelled = true }
  }, [layerSig, engineEpoch])

  // ------------------------------------------------------------- add images
  const handleFiles = async (files) => {
    setBusy(true)
    const engine = engineRef.current
    const created = []

    for (const file of files) {
      try {
        const src = await readDataURL(file)
        const img = await loadImage(src)
        const tex = makeTexture(img)

        const id = addLayer({
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 28),
          src, imgW: img.naturalWidth, imgH: img.naturalHeight,
          depthState: 'luminance',
        })
        engine?.setTexture(id + ':color', tex)
        engine?.setTexture(id + ':depth', depthTexture(depthFromLuminance(img)))

        // fit height, no stretch
        const scale = project.canvas.h / img.naturalHeight
        updateTransform(id, { scale })
        created.push({ id, w: img.naturalWidth * scale })
      } catch (e) {
        setUI({ status: 'image failed: ' + e.message })
      }
    }

    // lay new images out side by side, centred
    if (created.length) {
      const gap = project.canvas.h * 0.02
      const total = created.reduce((a, c) => a + c.w, 0) + gap * (created.length - 1)
      let x = -total / 2
      for (const c of created) {
        updateTransform(c.id, { x: Math.round(x + c.w / 2) })
        x += c.w + gap
      }
    }
    setBusy(false)

    // real depth in the background, one at a time
    for (const c of created) runDepth(c.id)
  }

  const runDepth = async (layerId) => {
    const st = useStore.getState()
    const layer = st.project.layers.find((l) => l.id === layerId)
    if (!layer?.src) return
    updateLayer(layerId, { depthState: 'pending' })
    try {
      const img = await loadImage(layer.src)
      const d = await estimateDepth(layer.src, img, st.depth,
        (m) => setUI({ status: `${layer.name}: ${m}` }))
      depthCache.set(layerId, d)
      engineRef.current?.setTexture(layerId + ':depth', depthTexture(d))
      updateLayer(layerId, { depthState: 'model' })
      setUI({ status: `${layer.name}: depth ready` })
    } catch (e) {
      updateLayer(layerId, { depthState: 'error' })
      setUI({ status: `depth failed (${e.message}) — using luminance` })
    }
  }

  // ---------------------------------------------------------------- presets
  const applyPreset = (key) => {
    const p = PRESETS[key]
    if (!p) return
    p.apply(useStore.getState())
    setUI({ status: `preset: ${p.name}` })
  }

  // ----------------------------------------------------------------- export
  const doExport = async () => {
    const engine = engineRef.current
    if (!engine) return
    const st = useStore.getState()
    setUI({ exporting: { frame: 0, total: 1, phase: 'starting' }, playing: false })
    try {
      const renderFrame = (t, w, h) =>
        engine.renderToBlob(resolveProject(st.project, t), t, w, h)
      const file = await exportVideo(
        renderFrame,
        {
          w: st.project.canvas.w, h: st.project.canvas.h,
          fps: st.project.fps, duration: st.project.duration,
          name: st.project.name || 'wall',
        },
        { onProgress: (p) => setUI({ exporting: p }) },
      )
      setUI({ exporting: null, status: 'exported → ' + file })
    } catch (e) {
      setUI({ exporting: null, status: 'export failed: ' + e.message })
    }
  }

  const doStill = async () => {
    const st = useStore.getState()
    const renderFrame = (t, w, h) =>
      engineRef.current.renderToBlob(resolveProject(st.project, t), t, w, h)
    await exportStill(renderFrame, st.project.canvas, st.ui.time, st.project.name || 'wall')
  }

  // ------------------------------------------------------------- save / load
  const saveProject = () => {
    const blob = new Blob([JSON.stringify(useStore.getState().project)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (project.name || 'project') + '.shimmer.json'
    a.click()
  }

  // Textures are rebuilt by the ensure-textures effect; here we only need the depth.
  const openProject = async (file) => {
    const p = JSON.parse(await file.text())
    loadProject(p)
    for (const l of p.layers) if (l.src && !depthCache.has(l.id)) runDepth(l.id)
  }

  const exp = ui.exporting

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Shimmer<em>Lab</em></span>

        <select defaultValue="" style={{ minWidth: 130 }}
          onChange={(e) => { if (e.target.value) applyPreset(e.target.value); e.target.value = '' }}>
          <option value="">Preset…</option>
          {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
        </select>

        <select value={`${project.canvas.w}x${project.canvas.h}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number)
            useStore.getState().setCanvas({ w, h })
          }}>
          <option value="4550x1000">4550 × 1000 — small wall</option>
          <option value="8750x1000">8750 × 1000 — long wall</option>
          <option value="1920x1080">1920 × 1080 — test</option>
        </select>

        <span className="spacer" />
        <span className="status">{busy ? 'loading images…' : ui.status}</span>

        <button className="btn sm" onClick={saveProject}>Save</button>
        <label className="btn sm">
          Open<input type="file" accept=".json"
            onChange={(e) => { if (e.target.files[0]) openProject(e.target.files[0]); e.target.value = '' }} />
        </label>
        <button className="btn sm" onClick={doStill} disabled={!!exp}>PNG</button>
        <button className="btn pri" onClick={doExport} disabled={!!exp}>
          {exp ? `${exp.phase} ${exp.frame}/${exp.total}` : 'Export MP4'}
        </button>
      </div>

      <LayersPanel
        onFiles={handleFiles}
        onRedepthAll={() => {
          depthCache.clear()
          for (const l of useStore.getState().project.layers) runDepth(l.id)
        }}
      />
      <Viewport engineRef={engineRef} onReady={() => setEngineEpoch((n) => n + 1)} />
      <Inspector onRedepth={(id) => { depthCache.delete(id); runDepth(id) }} />
      <Timeline />
      <HelpModal />
    </div>
  )
}
