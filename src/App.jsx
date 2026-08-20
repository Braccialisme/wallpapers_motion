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
import ProjectMenu from './ui/ProjectMenu.jsx'
import GuideModal from './ui/Guide.jsx'
import { saveAutosave, loadAutosave, loadAutosavePrev, debounce, putProject } from './engine/storage.js'
import { fsSupported, pickSave, pickOpen, writeHandle, readHandle, downloadProject, uploadProject } from './engine/fileio.js'

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
  tex.colorSpace = THREE.NoColorSpace   // raw passthrough: our pipeline is sRGB end-to-end, no hardware decode
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
  const newProject = useStore((s) => s.newProject)
  const [busy, setBusy] = useState(false)
  const [engineEpoch, setEngineEpoch] = useState(0)   // bumps whenever a new engine is created
  useShortcuts()
  const fileHandle = useRef(null)

  // kill the browser middle-click default (autoscroll orb) across the whole app;
  // our own middle-drag pan still works because it uses pointer events, not the default
  useEffect(() => {
    const kill = (e) => { if (e.button === 1) e.preventDefault() }
    document.addEventListener('mousedown', kill)
    document.addEventListener('auxclick', kill)
    return () => { document.removeEventListener('mousedown', kill); document.removeEventListener('auxclick', kill) }
  }, [])

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

  // ---------------------------------------------------------------- autosave
  // Everything lives in IndexedDB so a reload, a crash or a stopped dev server
  // never costs work. Restores on first mount, then writes on every change.
  const restored = useRef(false)
  useEffect(() => {
    (async () => {
      try {
        let p = await loadAutosave()
        if (!p?.layers?.length) { const prev = await loadAutosavePrev(); if (prev?.layers?.length) p = prev }
        if (p?.layers?.length) {
          loadProject(p)
          setUI({ status: 'restored your last session' })
          for (const l of p.layers) if (l.src && !depthCache.has(l.id)) runDepth(l.id)
        }
      } catch (e) {
        setUI({ status: 'could not restore autosave: ' + e.message })
      } finally {
        restored.current = true
      }
    })()
  }, [])

  const autosave = useRef(debounce((p) => { saveAutosave(p).catch(() => {}) }, 300)).current
  useEffect(() => {
    if (!restored.current) return      // don't overwrite the save before it is read
    autosave(project)
  }, [project])

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

    // lay new images out side by side, centred, and SCALE the group so it fits inside
    // the frame width (never spilling into the pasteboard where export would drop it)
    if (created.length) {
      const fw = project.canvas.w, fh = project.canvas.h
      const gap = fh * 0.015
      const total = created.reduce((a, c) => a + c.w, 0) + gap * (created.length - 1)
      const fit = total > fw ? fw / total : 1
      let x = -(total * fit) / 2
      for (const c of created) {
        const w = c.w * fit
        const l = useStore.getState().project.layers.find((L) => L.id === c.id)
        updateTransform(c.id, { x: Math.round(x + w / 2), y: 0, scale: (l?.transform.scale || 1) * fit })
        x += w + gap * fit
      }
    }
    setBusy(false)

    // real depth in the background, one at a time
    for (const c of created) runDepth(c.id)
  }

  // Drop images anywhere in the app, at any time — not just onto the empty-state panel.
  // (The panel's drop zone only exists when there are zero layers, so once you'd added
  // images there was nowhere left to drop new ones.)
  const handleFilesRef = useRef()
  handleFilesRef.current = handleFiles
  useEffect(() => {
    const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
    const onDragOver = (e) => { if (isFileDrag(e)) e.preventDefault() }
    const onDrop = (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      const fs = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'))
      if (fs.length) handleFilesRef.current?.(fs)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => { window.removeEventListener('dragover', onDragOver); window.removeEventListener('drop', onDrop) }
  }, [])

  // Cut the subject out of the selected image (background -> transparent) so it floats on
  // the paper. @imgly/background-removal downloads a small model once, then caches it.
  const cutSubject = async (layerId) => {
    const st = useStore.getState()
    const layer = st.project.layers.find((l) => l.id === layerId)
    if (!layer?.src) return
    setBusy(true); setUI({ status: 'cutting subject… (first run downloads the model)' })
    try {
      const { removeBackground } = await import('@imgly/background-removal')
      const blob = await removeBackground(layer.src)
      const src = await readDataURL(blob)
      const img = await loadImage(src)
      updateLayer(layerId, { src, depthState: 'luminance' })
      engineRef.current?.setTexture(layerId + ':color', makeTexture(img))
      engineRef.current?.setTexture(layerId + ':depth', depthTexture(depthFromLuminance(img)))
      depthCache.delete(layerId)
      runDepth(layerId)
      setUI({ status: 'subject cut out — background is now transparent' })
    } catch (e) {
      setUI({ status: 'cut failed: ' + (e.message || e) })
    }
    setBusy(false)
  }

  // Build a layer from text using opentype.js glyph outlines. Pair with the Saber preset and
  // the letters light up. (Latin/decorative only — opentype.js doesn't shape Arabic joining;
  // that needs a harfbuzz pass, noted in BACKLOG.)
  const makeTextLayer = async (text, fontFile) => {
    if (!text || !fontFile) return
    setBusy(true); setUI({ status: 'building text…' })
    try {
      const mod = await import('opentype.js')
      const opentype = mod.default || mod
      const buf = await fontFile.arrayBuffer()
      const font = opentype.parse(buf)
      const size = 300
      const bb = font.getPath(text, 0, 0, size).getBoundingBox()
      const pad = size * 0.25
      const w = Math.max(4, Math.ceil(bb.x2 - bb.x1 + pad * 2))
      const h = Math.max(4, Math.ceil(bb.y2 - bb.y1 + pad * 2))
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d')
      ctx.translate(pad - bb.x1, pad - bb.y1)
      const p = font.getPath(text, 0, 0, size)
      p.fill = '#efe9dd'
      p.draw(ctx)
      const src = c.toDataURL('image/png')
      const img = await loadImage(src)
      const id = addLayer({ name: text.slice(0, 20), src, imgW: w, imgH: h, depthState: 'luminance' })
      engineRef.current?.setTexture(id + ':color', makeTexture(img))
      engineRef.current?.setTexture(id + ':depth', depthTexture(depthFromLuminance(img)))
      updateTransform(id, { x: 0, y: 0, scale: (project.canvas.h * 0.6) / h })
      setUI({ status: 'text layer added — apply the Saber preset to light it up' })
    } catch (e) {
      setUI({ status: 'text failed: ' + (e.message || e) })
    }
    setBusy(false)
  }

  const fitAllToFrame = () => {
    const st = useStore.getState()
    const layers = st.project.layers
    if (!layers.length) return
    const fw = st.project.canvas.w, fh = st.project.canvas.h
    const items = layers.map((l) => { const s = fh / (l.imgH || fh); return { id: l.id, s, w: (l.imgW || fw) * s } })
    const gap = fh * 0.01
    const total = items.reduce((a, i) => a + i.w, 0) + gap * (items.length - 1)
    const fit = total > fw ? fw / total : 1
    let x = -(total * fit) / 2
    for (const it of items) {
      const w = it.w * fit
      updateTransform(it.id, { x: Math.round(x + w / 2), y: 0, scale: it.s * fit })
      x += w + gap * fit
    }
    setUI({ status: 'fitted all layers into the frame' })
  }

  // Fill the wall edge-to-edge with NO paper showing. Each image gets a slot sized to its
  // aspect; the slots tile the wall exactly, and every image is scaled to COVER its slot
  // (full height, width overflow cropped by the neighbour on top). Slots sum to the wall
  // width, so there are zero gaps -> paper can never show through.
  const fillWall = () => {
    const st = useStore.getState()
    const layers = st.project.layers.filter((l) => l.visible !== false)
    if (!layers.length) return
    const fw = st.project.canvas.w, fh = st.project.canvas.h
    const items = layers.map((l) => {
      const iw = l.imgW || fw, ih = l.imgH || fh
      return { id: l.id, iw, ih, a: iw / ih }
    })
    const A = items.reduce((s, i) => s + i.a, 0) || 1
    let xl = -fw / 2
    for (const it of items) {
      const slotW = fw * it.a / A
      const scale = Math.max(fh / it.ih, slotW / it.iw)   // cover the slot in both dims
      updateTransform(it.id, { x: Math.round(xl + slotW / 2), y: 0, scale })
      xl += slotW
    }
    if ((st.project.canvas.margin ?? 1) > 0) { /* stay in pasteboard, layout is inside the wall anyway */ }
    setUI({ status: 'filled the wall — images cover-cropped edge to edge, no paper' })
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
  const doNewProject = () => {
    if (!confirm('Start a new project? This clears the current layers, effects and timeline.')) return
    depthCache.clear()
    const eng = engineRef.current
    if (eng) eng.textures.forEach((t, k) => { t.dispose(); eng.textures.delete(k) })
    newProject()
    fileHandle.current = null
    if (useStore.getState().project.globalEffects.length === 0) addEffect('global', 'paper')
    setUI({ status: 'new project' })
  }

  const projectName = () => (useStore.getState().project.name || 'wall').trim() || 'wall'

  // Save to a real file on disk. First save asks where; later saves overwrite it.
  const doSave = async (forceDialog = false) => {
    const p = useStore.getState().project
    putProject(projectName(), p)   // crash-net
    // desktop app: native OS dialog + real file path
    if (window.desktop) {
      const path = await window.desktop.save({ name: projectName(), data: JSON.stringify(p),
        pathHint: forceDialog ? null : fileHandle.current })
      if (path) { fileHandle.current = path; setUI({ status: 'saved to ' + path.split(/[\/]/).pop() }) }
      return
    }
    if (!fsSupported) { downloadProject(p, projectName()); setUI({ status: 'downloaded project file' }); return }
    try {
      if (!fileHandle.current || forceDialog) fileHandle.current = await pickSave(projectName())
      await writeHandle(fileHandle.current, p)
      setUI({ status: `saved to ${fileHandle.current.name}` })
    } catch (e) { if (e.name !== 'AbortError') setUI({ status: 'save failed: ' + e.message }) }
  }

  const doOpenFile = async () => {
    try {
      let loaded
      if (window.desktop) {
        const r = await window.desktop.open()
        if (!r) return
        fileHandle.current = r.path
        loaded = { project: JSON.parse(r.data), name: r.path.split(/[\/]/).pop().replace(/\.(shimmer\.)?json$/i, '') }
      } else if (fsSupported) { const h = await pickOpen(); fileHandle.current = h; loaded = await readHandle(h) }
      else loaded = await uploadProject()
      const p = { ...loaded.project, name: loaded.name || loaded.project.name }
      loadProject(p)
      for (const l of p.layers) if (l.src && !depthCache.has(l.id)) runDepth(l.id)
      setUI({ status: `opened ${loaded.name}` })
    } catch (e) { if (e.name !== 'AbortError') setUI({ status: 'open failed: ' + e.message }) }
  }

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

  // Ctrl/Cmd+S saves to the current file (or asks where on the first save)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); doSave(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exp = ui.exporting

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Shimmer<em>Lab</em></span>
        <button className="btn sm" onClick={doNewProject}>New</button>
        <button className="btn sm pri" onClick={() => doSave(false)} title="save to a file on your computer (Ctrl+S)">Save</button>
        <ProjectMenu onLoad={(p) => { loadProject(p); for (const l of p.layers) if (l.src && !depthCache.has(l.id)) runDepth(l.id) }} />

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
          <option value="22050x1000">22050 × 1000 — all three walls</option>
          <option value="1920x1080">1920 × 1080 — test</option>
        </select>

        <span className="spacer" />
        <span className="status">{busy ? 'loading images…' : ui.status}</span>

        <button className="btn sm" onClick={() => setUI({ showGuide: true })}>Guide</button>
        <button className="btn sm" onClick={doOpenFile}>Open</button>
        <button className="btn sm" title="save as a new file" onClick={() => doSave(true)}>Save As</button>
        <button className="btn sm" onClick={doStill} disabled={!!exp}>PNG</button>
        <button className="btn pri" onClick={doExport} disabled={!!exp}>
          {exp ? `${exp.phase} ${exp.frame}/${exp.total}` : 'Export MP4'}
        </button>
      </div>

      <LayersPanel
        onFiles={handleFiles}
        onFitAll={fitAllToFrame}
        onFillWall={fillWall}
        onCutSubject={cutSubject}
        onAddText={makeTextLayer}
        onRedepthAll={() => {
          depthCache.clear()
          for (const l of useStore.getState().project.layers) runDepth(l.id)
        }}
      />
      <Viewport engineRef={engineRef} onReady={() => setEngineEpoch((n) => n + 1)} />
      <Inspector onRedepth={(id) => { depthCache.delete(id); runDepth(id) }} />
      <Timeline />
      <HelpModal />
      <GuideModal />
    </div>
  )
}
