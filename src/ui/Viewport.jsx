import React, { useEffect, useRef, useState } from 'react'
import Engine from '../engine/Engine.js'
import { useStore, resolveProject, cursorAt } from '../store.js'

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
      const s = useStore.getState()
      const { project, ui } = s
      if (ui.playing) {
        let t = ui.time + dt
        if (t > project.duration) t = ui.loop ? t % project.duration : project.duration
        s.setUI({ time: t })
      }
      const pw = Math.min(ui.previewWidth, project.canvas.w)
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
  const aspect = project.canvas.w / project.canvas.h

  // ---- zoom / pan ----
  const [view, setView] = useState({ z: 1, x: 0, y: 0 })
  const panRef = useRef(null)
  const wrapRef = useRef()

  // keep the scaled canvas overlapping the viewport so a pan/zoom can never lose it
  const clampView = (v) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return v
    const z = Math.min(12, Math.max(1, v.z))
    const mx = (r.width * (z - 1)) / 2 + r.width * 0.15
    const my = (r.height * (z - 1)) / 2 + r.height * 0.15
    return { z, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) }
  }
  const onWheel = (e) => {
    e.preventDefault()
    const f = Math.exp(-e.deltaY * 0.0015)
    setView((v) => clampView({ ...v, z: v.z * f }))
  }
  const startPan = (e) => {
    if (ui.cursorEdit && e.button === 0) return   // left is for the gizmo in edit mode
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()        // stop the browser middle-click autoscroll
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
  }
  useEffect(() => {
    const move = (e) => {
      if (!panRef.current) return
      setView((v) => clampView({ ...v, x: panRef.current.ox + (e.clientX - panRef.current.sx),
                                       y: panRef.current.oy + (e.clientY - panRef.current.sy) }))
    }
    const up = () => { panRef.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up) }
  }, [])

  // ---- cursor gizmo ----
  const innerRef = useRef()
  const dragPt = useRef(null)
  const toCanvas = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const onCanvasDown = (e) => {
    if (!useStore.getState().ui.cursorEdit || e.button !== 0 || e.detail > 1) return
    e.stopPropagation()
    const p = toCanvas(e)
    addCursorPoint(useStore.getState().ui.time, p.x, p.y)   // drop a point at the live playhead
  }
  const onHandleDown = (i) => (e) => {
    if (!ui.cursorEdit) return
    e.stopPropagation(); e.preventDefault()
    dragPt.current = i
  }
  useEffect(() => {
    const move = (e) => {
      if (dragPt.current == null) return
      const p = toCanvas(e)
      updateCursorPoint(dragPt.current, { x: p.x, y: p.y })
    }
    const up = () => { dragPt.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [])

  const cur = project.cursor
  const pos = cursorAt(cur, ui.time)
  const pts = cur?.points || []

  return (
    <div className="center">
      <div className="viewwrap" ref={wrapRef} onWheel={onWheel} onPointerDown={startPan}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}
        onAuxClick={(e) => e.preventDefault()}
        style={{ cursor: panRef.current ? 'grabbing' : ui.cursorEdit ? 'crosshair' : 'default' }}>
        <div ref={innerRef} className="viewinner"
          style={{ width: '100%', maxWidth: 1400, aspectRatio: aspect,
                   transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <canvas ref={canvasRef} className="view" style={{ width: '100%', aspectRatio: aspect }}
            onPointerDown={onCanvasDown} />

          {cur?.enabled && pts.length > 0 && (() => {
            const AX = 100 * aspect            // square units so handles stay round
            const dur = project.duration || 1
            const t0 = pts[0].t, t1 = pts[pts.length - 1].t
            const curve = []
            if (t1 > t0) for (let i = 0; i <= 64; i++) {
              const p = cursorAt(cur, t0 + ((t1 - t0) * i) / 64)
              if (p) curve.push(`${p.x * AX},${p.y * 100}`)
            }
            return (
            <svg viewBox={`0 0 ${AX} 100`} preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {curve.length > 1 && (
                <polyline fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1" strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke" points={curve.join(' ')} />
              )}
              {pts.map((p, i) => (
                <circle key={i} cx={p.x * AX} cy={p.y * 100} r="1.4" vectorEffect="non-scaling-stroke"
                  fill={Math.abs(p.t - ui.time) < 0.06 ? '#fff' : 'rgba(255,255,255,.4)'}
                  stroke="#000" strokeWidth="0.5"
                  style={{ cursor: 'grab', pointerEvents: ui.cursorEdit ? 'auto' : 'none' }}
                  onPointerDown={onHandleDown(i)}
                  onDoubleClick={(e) => { e.stopPropagation(); removeCursorPoint(i) }} />
              ))}
              {pos && (
                <circle cx={pos.x * AX} cy={pos.y * 100} r={(cur.spread || 0.16) * 100}
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
        <span className="mono" style={{ color: 'var(--faint)' }}>{Math.round(view.z * 100)}%</span>
        <button className="btn ico" title="reset view" onClick={() => setView({ z: 1, x: 0, y: 0 })}>⟳</button>
        <span className="mono">{project.canvas.w}×{project.canvas.h}</span>
        <span style={{ flex: 1 }} />
        <span>preview {Math.min(ui.previewWidth, project.canvas.w)}px</span>
        <input type="range" min={600} max={3000} step={50} value={ui.previewWidth} style={{ width: 120 }}
          onChange={(e) => setUI({ previewWidth: Number(e.target.value) })} />
      </div>
    </div>
  )
}
