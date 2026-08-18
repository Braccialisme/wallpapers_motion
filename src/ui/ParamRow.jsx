import React from 'react'
import { useStore, evalKeys } from '../store.js'
import ColorWheel from './ColorWheel.jsx'

export default function ParamRow({ def, pkey, value, onChange, kfPath }) {
  const { project, ui } = useStore()
  const addKey = useStore((s) => s.addKey)
  const removeKey = useStore((s) => s.removeKey)
  const clearKeys = useStore((s) => s.clearKeys)

  const keys = project.keyframes[kfPath]
  const t = ui.time
  const hasKeyHere = keys?.some((k) => Math.abs(k.t - t) < 1e-3)
  const animated = !!keys?.length
  const shown = animated ? evalKeys(keys, t) : value

  const toggleKey = () => {
    if (hasKeyHere) removeKey(kfPath, t)
    else addKey(kfPath, t, shown)
  }
  // editing an animated param writes a key at the playhead instead of a static value
  const set = (v) => (animated ? addKey(kfPath, t, v) : onChange(v))

  const KeyBtn = () => (
    <button
      className={'kbtn' + (hasKeyHere ? ' here' : animated ? ' anim' : '')}
      title={animated ? 'keyframed — click to add/remove at the playhead' : 'add keyframe'}
      onClick={toggleKey}
    />
  )

  if (def.type === 'color') {
    return (
      <div className="prm">
        <div className="prm-top">
          <KeyBtn />
          <span className="prm-lbl">{def.label || pkey}</span>
          {animated && (
            <button className="btn sm" onClick={() => clearKeys(kfPath)}>clear</button>
          )}
        </div>
        <ColorWheel value={shown} onChange={set} />
      </div>
    )
  }

  if (def.type === 'bool') {
    return (
      <div className="prm">
        <div className="prm-top">
          <span className="prm-lbl">{def.label || pkey}</span>
        </div>
        <div className="seg">
          <button className={value ? '' : 'on'} onClick={() => onChange(false)}>off</button>
          <button className={value ? 'on' : ''} onClick={() => onChange(true)}>on</button>
        </div>
      </div>
    )
  }

  if (def.type === 'select') {
    return (
      <div className="prm">
        <div className="prm-top">
          <span className="prm-lbl">{def.label || pkey}</span>
        </div>
        {def.options.length <= 3 ? (
          <div className="seg">
            {def.options.map((o, i) => (
              <button key={o} className={Math.round(value) === i ? 'on' : ''} onClick={() => onChange(i)}>{o}</button>
            ))}
          </div>
        ) : (
          <select style={{ width: '100%' }} value={Math.round(value)}
            onChange={(e) => onChange(Number(e.target.value))}>
            {def.options.map((o, i) => <option key={o} value={i}>{o}</option>)}
          </select>
        )}
      </div>
    )
  }

  const min = def.min ?? 0, max = def.max ?? 1, step = def.step ?? 0.01
  const digits = step < 0.01 ? 3 : step < 1 ? 2 : 0
  return (
    <div className="prm">
      <div className="prm-top">
        <KeyBtn />
        <span className="prm-lbl">{def.label || pkey}</span>
        <span className="prm-val">{Number(shown).toFixed(digits)}</span>
        {animated && <button className="btn sm" onClick={() => clearKeys(kfPath)}>clear</button>}
      </div>
      <input type="range" min={min} max={max} step={step} value={Number(shown)}
        onChange={(e) => set(Number(e.target.value))} />
    </div>
  )
}
