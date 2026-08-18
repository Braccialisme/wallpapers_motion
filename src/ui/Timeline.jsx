import React from 'react'
import { useStore } from '../store.js'
import { getEffect } from '../effects/index.js'

function labelFor(project, path) {
  const p = path.split(':')
  if (p[0] === 'G') {
    const fx = project.globalEffects.find((f) => f.id === p[2])
    return `Global · ${getEffect(fx?.type)?.name || '?'} · ${p[3]}`
  }
  const layer = project.layers.find((l) => l.id === p[1])
  const ln = layer?.name || '?'
  if (p[2] === 'T') return `${ln} · ${p[3]}`
  const fx = layer?.effects.find((f) => f.id === p[3])
  return `${ln} · ${getEffect(fx?.type)?.name || '?'} · ${p[4]}`
}

export default function Timeline() {
  const { project, ui } = useStore()
  const setUI = useStore((s) => s.setUI)
  const removeKey = useStore((s) => s.removeKey)
  const setProject = useStore((s) => s.setProject)
  const dur = project.duration || 1
  const paths = Object.keys(project.keyframes)

  return (
    <div className="timeline">
      <div className="tl-head">
        <button className="btn pri" style={{ minWidth: 92, justifyContent: 'center' }}
          onClick={() => setUI({ playing: !ui.playing })}>
          {ui.playing ? '❚❚  Pause' : '▶  Play'}
        </button>
        <button className="btn ico" title="back to start" onClick={() => setUI({ time: 0 })}>⏮</button>
        <button className={'btn sm' + (ui.loop ? ' on' : '')} onClick={() => setUI({ loop: !ui.loop })}>Loop</button>
        <span className="mono" style={{ minWidth: 104, fontSize: 12 }}>
          {ui.time.toFixed(2)}s <span style={{ color: 'var(--faint)' }}>/ {dur}s</span>
        </span>
        <input className="grow" type="range" min={0} max={dur} step={1 / (project.fps || 24)}
          value={ui.time} onChange={(e) => setUI({ time: Number(e.target.value), playing: false })} />
        <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>dur</span>
        <input type="number" min={1} max={600} value={dur} style={{ width: 64 }}
          onChange={(e) => setProject({ duration: Math.max(1, Number(e.target.value) || 1) })} />
        <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>fps</span>
        <input type="number" min={1} max={60} value={project.fps} style={{ width: 56 }}
          onChange={(e) => setProject({ fps: Math.max(1, Number(e.target.value) || 24) })} />
        <button className="btn ico" title="keyboard shortcuts" onClick={() => setUI({ showHelp: true })}>?</button>
      </div>

      {paths.length === 0 ? (
        <div className="empty">
          No keyframes yet — click the ○ beside any parameter to key it at the playhead
        </div>
      ) : paths.map((path) => (
        <div className="track" key={path}>
          <div className="lbl" title={path}>{labelFor(project, path)}</div>
          <div className="lane"
            onDoubleClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setUI({ time: ((e.clientX - r.left) / r.width) * dur, playing: false })
            }}>
            {project.keyframes[path].map((k) => (
              <div key={k.t} className="kf" style={{ left: `${(k.t / dur) * 100}%` }}
                title={`${k.t.toFixed(2)}s — click to jump, shift-click to delete`}
                onClick={(e) => { e.stopPropagation()
                  if (e.shiftKey) removeKey(path, k.t); else setUI({ time: k.t, playing: false }) }} />
            ))}
            <div className="play" style={{ left: `${(ui.time / dur) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
