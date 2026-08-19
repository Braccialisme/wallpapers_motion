import React, { useRef, useState } from 'react'
import { useStore, evalKeys } from '../store.js'
import { getEffect } from '../effects/index.js'
import NumberField from './NumberField.jsx'

function trackLabel(project, path) {
  const p = path.split(':')
  if (p[0] === 'G') { const fx = project.globalEffects.find((f) => f.id === p[2]); return `${getEffect(fx?.type)?.name || '?'} · ${p[3]}` }
  if (p[2] === 'T') return p[3]
  const layer = project.layers.find((l) => l.id === p[1])
  const fx = layer?.effects.find((f) => f.id === p[3])
  return `${getEffect(fx?.type)?.name || '?'} · ${p[4]}`
}

function ValueSpline({ keys, dur }) {
  if (!keys || keys.length < 1) return null
  const nums = keys.map((k) => k.v).filter((v) => typeof v === 'number')
  if (nums.length < keys.length) return null
  let lo = Math.min(...nums), hi = Math.max(...nums)
  if (hi - lo < 1e-6) { lo -= 0.5; hi += 0.5 }
  const pts = []
  for (let i = 0; i <= 60; i++) { const t = (i / 60) * dur; const v = evalKeys(keys, t); pts.push(`${(t / dur) * 100},${90 - ((v - lo) / (hi - lo)) * 80}`) }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function Timeline() {
  const { project, ui } = useStore()
  const setUI = useStore((s) => s.setUI)
  const removeKey = useStore((s) => s.removeKey)
  const moveKey = useStore((s) => s.moveKey)
  const clearKeys = useStore((s) => s.clearKeys)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const setProject = useStore((s) => s.setProject)
  const updateCursorPoint = useStore((s) => s.updateCursorPoint)
  const dur = project.duration || 1
  const selectedKey = ui.selectedKey
  const drag = useRef(null)
  const [collapsed, setCollapsed] = useState({})

  const groups = []
  const gG = Object.keys(project.keyframes).filter((p) => p.startsWith('G:'))
  if (gG.length) groups.push({ key: 'G', name: 'Global', paths: gG })
  for (const layer of project.layers) {
    const paths = Object.keys(project.keyframes).filter((p) => p.startsWith(`L:${layer.id}:`))
    if (paths.length) groups.push({ key: layer.id, name: layer.name, paths })
  }
  const cursorPts = project.cursor?.enabled ? (project.cursor.points || []) : []

  React.useEffect(() => {
    const move = (e) => {
      const d = drag.current
      if (!d) return
      const r = d.lane.getBoundingClientRect()
      const nt = Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur))
      if (d.kind === 'key') { moveKey(d.path, d.t, nt); setUI({ time: nt, selectedKey: { path: d.path, t: nt } }) }
      else { updateCursorPoint(d.i, { t: nt }); setUI({ time: nt }) }
      d.t = nt
    }
    const up = () => { drag.current = null }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [dur])

  const keyDown = (path, k) => (e) => {
    e.stopPropagation()
    if (e.shiftKey) { removeKey(path, k.t); if (selectedKey?.path === path) setUI({ selectedKey: null }); return }
    drag.current = { kind: 'key', path, t: k.t, lane: e.currentTarget.closest('.lane') }
    setUI({ time: k.t, playing: false, selectedKey: { path, t: k.t } })
  }
  const cptDown = (i, t) => (e) => {
    e.stopPropagation()
    drag.current = { kind: 'cpt', i, t, lane: e.currentTarget.closest('.lane') }
    setUI({ time: t, playing: false })
  }

  const Lane = ({ children, onDbl }) => (
    <div className="lane" onDoubleClick={onDbl}>{children}<div className="play" style={{ left: `${(ui.time / dur) * 100}%` }} /></div>
  )

  return (
    <div className="timeline">
      <div className="tl-head">
        <button className="btn pri" style={{ minWidth: 92, justifyContent: 'center' }} onClick={() => setUI({ playing: !ui.playing })}>{ui.playing ? '❚❚  Pause' : '▶  Play'}</button>
        <button className="btn ico" title="back to start" onClick={() => setUI({ time: 0 })}>⏮</button>
        <button className={'btn sm' + (ui.loop ? ' on' : '')} onClick={() => setUI({ loop: !ui.loop })}>Loop</button>
        <span className="mono" style={{ minWidth: 104, fontSize: 12 }}>{ui.time.toFixed(2)}s <span style={{ color: 'var(--faint)' }}>/ {dur}s</span></span>
        <input className="grow" type="range" min={0} max={dur} step={1 / (project.fps || 24)} value={ui.time} onChange={(e) => setUI({ time: Number(e.target.value), playing: false })} />
        <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>dur</span>
        <NumberField value={dur} min={1} max={600} step={1} style={{ width: 64 }} onCommit={(n) => setProject({ duration: n })} />
        <span style={{ color: 'var(--faint)', fontSize: 11.5 }}>fps</span>
        <NumberField value={project.fps} min={1} max={60} step={1} style={{ width: 56 }} onCommit={(n) => setProject({ fps: n })} />
        <button className="btn ico" title="undo (Ctrl+Z)" onClick={() => undo()}>↶</button>
        <button className="btn ico" title="redo (Ctrl+Shift+Z)" onClick={() => redo()}>↷</button>
        <button className="btn ico" title="keyboard shortcuts" onClick={() => setUI({ showHelp: true })}>?</button>
      </div>

      {groups.length === 0 && cursorPts.length === 0 && (
        <div className="empty">No keyframes yet — click the ○ beside any parameter to key it, or add a reveal cursor path</div>
      )}

      {groups.map((g) => {
        const open = !collapsed[g.key]
        return (
          <div className="tl-group" key={g.key}>
            <div className="tl-grouphead" onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))}>
              <span className={'chev' + (open ? ' open' : '')}>›</span>
              <span className="nm">{g.name}</span>
              <span className="ct">{g.paths.length}</span>
            </div>
            {open && g.paths.map((path) => (
              <div className="track" key={path}>
                <div className="lbl" title={path} style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 14 }}>
                  <button className="btn ico" title="delete track" style={{ width: 18, height: 18, flex: 'none' }} onClick={() => { clearKeys(path); if (selectedKey?.path === path) setUI({ selectedKey: null }) }}>✕</button>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trackLabel(project, path)}</span>
                </div>
                <Lane onDbl={(e) => { const r = e.currentTarget.getBoundingClientRect(); setUI({ time: ((e.clientX - r.left) / r.width) * dur, playing: false }) }}>
                  <ValueSpline keys={project.keyframes[path]} dur={dur} />
                  {project.keyframes[path].map((k) => (
                    <div key={k.t} className={'kf' + (selectedKey && selectedKey.path === path && Math.abs(selectedKey.t - k.t) < 1e-3 ? ' sel' : '')} style={{ left: `${(k.t / dur) * 100}%` }} title={`${k.t.toFixed(2)}s — drag to move, shift-click / Delete to remove`} onPointerDown={keyDown(path, k)} />
                  ))}
                </Lane>
              </div>
            ))}
          </div>
        )
      })}

      {cursorPts.length > 0 && (() => {
        const open = !collapsed['cursor']
        return (
          <div className="tl-group">
            <div className="tl-grouphead" onClick={() => setCollapsed((c) => ({ ...c, cursor: open }))}>
              <span className={'chev' + (open ? ' open' : '')}>›</span>
              <span className="nm" style={{ color: 'var(--acc2)' }}>Reveal cursor</span>
              <span className="ct">{cursorPts.length} pts</span>
            </div>
            {open && (
              <div className="track">
                <div className="lbl" style={{ paddingLeft: 14 }}>path points</div>
                <Lane onDbl={(e) => { const r = e.currentTarget.getBoundingClientRect(); setUI({ time: ((e.clientX - r.left) / r.width) * dur, playing: false }) }}>
                  {cursorPts.map((pt, i) => (
                    <div key={i} className="kf" style={{ left: `${(pt.t / dur) * 100}%`, background: '#7fd1c1' }} title={`point ${i + 1} @ ${pt.t.toFixed(2)}s — drag to move`} onPointerDown={cptDown(i, pt.t)} />
                  ))}
                </Lane>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
