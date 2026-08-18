import React, { useEffect, useRef } from 'react'
import Engine from '../engine/Engine.js'
import { useStore, resolveProject } from '../store.js'

export default function Viewport({ engineRef, onReady }) {
  const canvasRef = useRef()
  const rafRef = useRef()
  const lastRef = useRef(performance.now())

  useEffect(() => {
    const engine = new Engine(canvasRef.current)
    engineRef.current = engine
    onReady?.(engine)
    if (import.meta.env.DEV) window.__engine = engine   // handy in the console

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
      const baked = resolveProject(project, ui.time)
      try {
        engine.render(baked, ui.time, { width: pw, height: ph })
      } catch (e) {
        // keep the loop alive; a bad shader shouldn't kill the app
        console.error('[render]', e)
      }
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  const { project, ui } = useStore()
  const aspect = project.canvas.w / project.canvas.h

  return (
    <div className="center">
      <div className="viewwrap">
        <div className="viewinner" style={{ width: '100%', maxWidth: 1400, aspectRatio: aspect }}>
          <canvas ref={canvasRef} className="view" style={{ width: '100%', aspectRatio: aspect }} />
        </div>
      </div>
      <div className="viewbar">
        <span className="mono">canvas {project.canvas.w}×{project.canvas.h}</span>
        <span className="mono">preview {Math.min(ui.previewWidth, project.canvas.w)}px</span>
        <span style={{ flex: 1 }} />
        <span>preview quality</span>
        <input type="range" min={600} max={3000} step={50} value={ui.previewWidth}
          onChange={(e) => useStore.getState().setUI({ previewWidth: Number(e.target.value) })} />
      </div>
    </div>
  )
}
