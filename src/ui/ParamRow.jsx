import React from 'react'
import { useStore, evalKeys } from '../store.js'

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
    else addKey(kfPath, t, Number(shown))
  }

  const set = (v) => {
    if (animated) addKey(kfPath, t, v)   // editing an animated param writes a key here
    else onChange(v)
  }

  if (def.type === 'bool') {
    return (
      <div className="p">
        <label>
          <button className={'key' + (animated ? ' on' : '')} title="keyframe" onClick={toggleKey} />
          {def.label || pkey}
          <span className="v">{value ? 'on' : 'off'}</span>
        </label>
        <div style={{ gridColumn: '1/-1' }}>
          <button className={'btn sm' + (value ? ' on' : '')} onClick={() => onChange(!value)}>
            {value ? 'enabled' : 'disabled'}
          </button>
        </div>
      </div>
    )
  }

  if (def.type === 'select') {
    return (
      <div className="p">
        <label>{def.label || pkey}</label>
        <select
          style={{ gridColumn: '1/-1' }}
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {def.options.map((o, i) => <option key={o} value={i}>{o}</option>)}
        </select>
      </div>
    )
  }

  const min = def.min ?? 0, max = def.max ?? 1, step = def.step ?? 0.01
  return (
    <div className="p">
      <label>
        <button
          className={'key' + (hasKeyHere ? ' on' : animated ? ' on' : '')}
          style={animated && !hasKeyHere ? { opacity: 0.55 } : undefined}
          title={animated ? 'keyframed — click to add/remove at playhead' : 'add keyframe'}
          onClick={toggleKey}
        />
        {def.label || pkey}
        {animated && <span style={{ color: 'var(--acc)' }}>◆</span>}
        <span className="v">{Number(shown).toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</span>
        {animated && (
          <button className="btn sm" title="clear all keys" onClick={() => clearKeys(kfPath)}>✕</button>
        )}
      </label>
      <input
        style={{ gridColumn: '1/-1' }}
        type="range" min={min} max={max} step={step}
        value={Number(shown)}
        onChange={(e) => set(Number(e.target.value))}
      />
    </div>
  )
}
