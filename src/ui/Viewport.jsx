import React, { useEffect, useRef, useState } from 'react'
import Engine from '../engine/Engine.js'
import { useStore, resolveProject, cursorAt, WALL_ZONES } from '../store.js'
import { audioState, startAudio, stopAudio } from '../engine/audio.js'

export default function Viewport({ engineRef, onReady }) {
  const canvasRef = useRef()
  const rafRef = useRef()
  const lastRef = useRef(performance.now())

  useEffect(() => {
    const engine = new Engine(canvasRef.current)
    engineRef.current = engine
    onReady?.(engine)
    if (import.meta.env.DEV) window.__engine = engine

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastRef.current) / 1000)
      lastRef.current = now
      engine.audio = audioState   // live audio-reactive values for the shaders
      const s = useStore.getState()
      const { project, ui } = s
      if (ui.playing) {
        let t = ui.time + dt
        if (t > project.duration) t = ui.loop ? t % project.duration : project.duration
        s.setUI({ time: t })
      }
      // preview renders the WORLD (frame + surround); width is the world width
      const wf = 1 + 2 * (project.canvas.margin ?? 1.0)
      const pw = Math.round(Math.min(ui.previewWidth, project.canvas.w) * wf)
      const ph = Math.max(2, Math.round((pw * project.canvas.h) / project.canvas.w))
      try {
        engine.render(resolveProject(project, ui.time), ui.time, { width: pw, height: ph, viewDepth: ui.viewDepth })
      } catch (e) { console.error('[render]', e) }
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(rafRef.current); engine.dispose(); engineRef.current = null }
  }, [])

  const { project, ui } = useStore()
  const setUI = useStore((s) => s.setUI)
  const addCursorPoint = useStore((s) => s.addCursorPoint)
  const updateCursorPoint = useStore((s) => s.updateCursorPoint)
  const removeCursorPoint = useStore((s) => s.removeCursorPoint)
  const setCanvas = useStore((s) => s.setCanvas)

  // world / frame geometry ---------------------------------------------------
  const m = project.canvas.margin ?? 1.0
  const fr = m > 0 ? m / (1 + 2 * m) : 0     // frame origin within the world (normalised)
  const frs = 1 / (1 + 2 * m)                // frame size within the world
  const fitZ = 1 / frs                       // zoom that makes the frame fill the viewport
  const aspect = project.canvas.w / project.canvas.h   // frame == world aspect (equal margin)
  const toFrame = (n) => ({ x: (n.x - fr) / frs, y: (n.y - fr) / frs })   // world-norm -> frame-norm

  // zoom / pan ---------------------------------------------------------------
  const [view, setView] = useState({ z: fitZ, x: 0, y: 0 })
  const [audioOn, setAudioOn] = useState(false)
  const panRef = useRef(null)
  const wrapRef = useRef()

  const clampView = (v) => {
    let z = isFinite(v.z) ? v.z : fitZ
    z = Math.min(12, Math.max(0.5, z))
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return { z, x: isFinite(v.x) ? v.x : 0, y: isFinite(v.y) ? v.y : 0 }
    const mx = r.width * (0.5 + z * 0.5), my = r.height * (0.5 + z * 0.5)
    const x = Math.max(-mx, Math.min(mx, isFinite(v.x) ? v.x : 0))
    const y = Math.max(-my, Math.min(my, isFinite(v.y) ? v.y : 0))
    return { z, x, y }
  }
  const resetView = () => setView({ z: fitZ, x: 0, y: 0 })
  const onWheel = (e) => { e.preventDefault(); setView((v) => clampView({ ...v, z: v.z * Math.exp(-e.deltaY * 0.0015) })) }
  const startPan = (e) => {
    if (ui.cursorEdit && e.button === 0) return
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
  }
  useEffect(() => {
    const move = (e) => {
      const pr = panRef.current
      if (!pr) return
      const nx = pr.ox + (e.clientX - pr.sx), ny = pr.oy + (e.clientY - pr.sy)
      setView((v) => clampView({ ...v, x: nx, y: ny }))
    }
    const up = () => { panRef.current = null }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up); window.addEventListener('blur', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up) }
  }, [])

  // cursor gizmo -------------------------------------------------------------
  const dragPt = useRef(null)
  const toCanvas = (e) => {   // world-normalised 0..1 across the whole preview
    const r = canvasRef.current.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const onCanvasDown = (e) => {
    if (!useStore.getState().ui.cursorEdit || e.button !== 0 || e.detail > 1) return
    e.stopPropagation()
    const f = toFrame(toCanvas(e))
    addCursorPoint(useStore.getState().ui.time, f.x, f.y)
  }
  const onHandleDown = (i) => (e) => { if (!ui.cursorEdit) return; e.stopPropagation(); e.preventDefault(); dragPt.current = i }
  useEffect(() => {
    const move = (e) => { if (dragPt.current == null) return; const f = toFrame(toCanvas(e)); updateCursorPoint(dragPt.current, { x: f.x, y: f.y }) }
    const up = () => { dragPt.current = null }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [fr, frs])

  const cur = project.cursor
  const pos = cursorAt(cur, ui.time)
  const pts = cur?.points || []
  const AX = 100 * aspect
  const wx = (fx) => (fr + fx * frs) * AX     // frame-norm x -> world SVG x
  const wy = (fy) => (fr + fy * frs) * 100

  return (
    <div className="center">
      <div className="viewwrap" ref={wrapRef} onWheel={onWheel} onPointerDown={startPan}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}
        onAuxClick={(e) => e.preventDefault()}
        onDoubleClick={() => { if (!ui.cursorEdit) resetView() }}
        style={{ cursor: panRef.current ? 'grabbing' : ui.cursorEdit ? 'crosshair' : 'default' }}>
        <div className="viewinner"
          style={{ width: '100%', maxWidth: 1400, aspectRatio: aspect,
                   transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <canvas ref={canvasRef} className="view" style={{ width: '100%', aspectRatio: aspect }}
            onPointerDown={onCanvasDown} />

          {/* the export frame (artboard) outline; everything outside is the work surface */}
          <svg viewBox={`0 0 ${AX} 100`} preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {/* the export frame outline only — the surround is the dark pasteboard itself */}
            <rect x={fr * AX} y={fr * 100} width={frs * AX} height={frs * 100}
              fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5"
              vectorEffect="non-scaling-stroke" />
            {/* 3-wall master. Thematic zones (from the scenography SVG) = faint guides to place
                content on the right theme. Physical walls (the export cut) = solid blue lines. */}
            {project.canvas.w > 16384 && WALL_ZONES.slice(1, -1).map((z, i) => {
              const fx = (fr + z * frs) * AX
              return <line key={'z' + i} x1={fx} y1={fr * 100} x2={fx} y2={(fr + frs) * 100}
                stroke="rgba(127,209,193,.5)" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
            })}
            {project.canvas.w > 16384 && WALL_ZONES.slice(0, -1).map((z, i) => {
              const cx = (z + WALL_ZONES[i + 1]) / 2
              return <text key={'zl' + i} x={(fr + cx * frs) * AX} y={(fr + frs) * 100 - 3}
                fill="rgba(127,209,193,.7)" fontSize="3" textAnchor="middle">{i + 1}</text>
            })}
            {project.canvas.w > 16384 && [8750, 17500].map((bx) => {
              const fx = (fr + (bx / project.canvas.w) * frs) * AX
              return <line key={bx} x1={fx} y1={fr * 100} x2={fx} y2={(fr + frs) * 100}
                stroke="rgba(0,124,255,.85)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            })}
            {project.canvas.w > 16384 && [['1', 4375], ['2', 13125], ['3', 19775]].map(([n, cx]) => (
              <text key={'w' + n} x={(fr + (cx / project.canvas.w) * frs) * AX} y={fr * 100 + 6}
                fill="rgba(0,124,255,.95)" fontSize="4" textAnchor="middle">wall {n}</text>
            ))}
          </svg>

          {cur?.enabled && pts.length > 0 && (() => {
            const dur = project.duration || 1
            const t0 = pts[0].t, t1 = pts[pts.length - 1].t
            const curve = []
            if (t1 > t0) for (let i = 0; i <= 64; i++) {
              const p = cursorAt(cur, t0 + ((t1 - t0) * i) / 64)
              if (p) curve.push(`${wx(p.x)},${wy(p.y)}`)
            }
            return (
              <svg viewBox={`0 0 ${AX} 100`} preserveAspectRatio="none"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {curve.length > 1 && (
                  <polyline fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1" strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke" points={curve.join(' ')} />
                )}
                {pts.map((p, i) => (
                  <circle key={i} cx={wx(p.x)} cy={wy(p.y)} r="1.4" vectorEffect="non-scaling-stroke"
                    fill={Math.abs(p.t - ui.time) < 0.06 ? '#fff' : 'rgba(255,255,255,.4)'}
                    stroke="#000" strokeWidth="0.5"
                    style={{ cursor: 'grab', pointerEvents: ui.cursorEdit ? 'auto' : 'none' }}
                    onPointerDown={onHandleDown(i)}
                    onDoubleClick={(e) => { e.stopPropagation(); removeCursorPoint(i) }} />
                ))}
                {pos && (
                  <circle cx={wx(pos.x)} cy={wy(pos.y)} r={(cur.spread || 0.16) * frs * 100}
                    fill="rgba(127,209,193,.07)" stroke="#7fd1c1" strokeWidth="0.8"
                    vectorEffect="non-scaling-stroke" pointerEvents="none" />
                )}
              </svg>)
          })()}
        </div>
      </div>

      <div className="viewbar">
        <button className={'btn sm' + (ui.viewDepth ? ' on' : '')} title="inspect depth maps (D)"
          onClick={() => setUI({ viewDepth: !ui.viewDepth })}>
          {ui.viewDepth ? 'Depth' : 'Colour'}
        </button>
        <button className={'btn sm' + (ui.cursorEdit ? ' on' : '')}
          title="edit the reveal cursor path — click to drop a point at the playhead, drag points, double-click to delete"
          onClick={() => setUI({ cursorEdit: !ui.cursorEdit })}>
          Cursor {ui.cursorEdit ? '●' : '○'}
        </button>
        <button className={'btn sm' + (audioOn ? ' on' : '')}
          title="audio-reactive: let the mic drive uAudio/uAudioLow/Mid/High in the shaders (Saber, Gold-leaf react)"
          onClick={async () => {
            if (audioOn) { stopAudio(); setAudioOn(false) }
            else { const ok = await startAudio(); setAudioOn(ok) }
          }}>
          Audio {audioOn ? '●' : '○'}
        </button>
        <span className="mono" style={{ color: 'var(--faint)' }}>{Math.round((view.z / fitZ) * 100)}%</span>
        <button className={'btn sm' + (m > 0 ? ' on' : '')}
          title="toggle the pasteboard (dark surround you can park layers on)"
          onClick={() => { setCanvas({ margin: m > 0 ? 0 : 1 }); setTimeout(resetView, 0) }}>
          {m > 0 ? 'Pasteboard' : 'Frame only'}
        </button>
        <button className="btn ico" title="fit the frame (double-click canvas)" onClick={resetView}>⟳ fit</button>
        <span className="mono">{project.canvas.w}×{project.canvas.h}</span>
        <span style={{ flex: 1 }} />
        <span>preview {Math.min(ui.previewWidth, project.canvas.w)}px</span>
        <input type="range" min={600} max={3000} step={50} value={ui.previewWidth} style={{ width: 120 }}
          onChange={(e) => setUI({ previewWidth: Number(e.target.value) })} />
      </div>
    </div>
  )
}
