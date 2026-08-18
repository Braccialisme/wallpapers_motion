import React, { useState } from 'react'
import { useStore, pathE, pathG } from '../store.js'
import { effectList, getEffect } from '../effects/index.js'
import ParamRow from './ParamRow.jsx'

export default function EffectChain({ target, effects }) {
  const [open, setOpen] = useState({})
  const [adding, setAdding] = useState(false)
  const addEffect = useStore((s) => s.addEffect)
  const updateEffect = useStore((s) => s.updateEffect)
  const removeEffect = useStore((s) => s.removeEffect)
  const moveEffect = useStore((s) => s.moveEffect)
  const setParam = useStore((s) => s.setParam)

  const available = effectList(target === 'global' ? 'global' : 'layer')

  return (
    <div>
      {effects.length === 0 && <div className="empty">No effects yet</div>}

      {effects.map((fx, i) => {
        const def = getEffect(fx.type)
        if (!def) {
          return (
            <div className="fx" key={fx.id}>
              <div className="fx-head">
                <span className="nm">unknown · {fx.type}</span>
                <button className="btn ico" onClick={() => removeEffect(target, fx.id)}>✕</button>
              </div>
            </div>
          )
        }
        const isOpen = open[fx.id] ?? i === effects.length - 1
        return (
          <div className={'fx' + (fx.enabled ? '' : ' off')} key={fx.id}>
            <div className="fx-head" onClick={() => setOpen((o) => ({ ...o, [fx.id]: !isOpen }))}>
              <span className={'chev' + (isOpen ? ' open' : '')}>›</span>
              <span className="nm">{def.name}</span>
              <button className="btn ico" title="mute"
                onClick={(e) => { e.stopPropagation(); updateEffect(target, fx.id, { enabled: !fx.enabled }) }}>
                {fx.enabled ? '◉' : '○'}
              </button>
              <button className="btn ico" title="move up"
                onClick={(e) => { e.stopPropagation(); moveEffect(target, fx.id, -1) }}>↑</button>
              <button className="btn ico" title="move down"
                onClick={(e) => { e.stopPropagation(); moveEffect(target, fx.id, 1) }}>↓</button>
              <button className="btn ico" title="remove"
                onClick={(e) => { e.stopPropagation(); removeEffect(target, fx.id) }}>✕</button>
            </div>
            {isOpen && (
              <div className="fx-body">
                {Object.entries(def.params).map(([k, p]) => (
                  <ParamRow key={k} def={p} pkey={k}
                    value={fx.params[k] ?? p.default}
                    onChange={(v) => setParam(target, fx.id, k, v)}
                    kfPath={target === 'global' ? pathG(fx.id, k) : pathE(target, fx.id, k)} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {!adding ? (
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
          onClick={() => setAdding(true)}>+ Add effect</button>
      ) : (
        <select autoFocus style={{ width: '100%', marginTop: 10 }} defaultValue=""
          onChange={(e) => { if (e.target.value) addEffect(target, e.target.value); setAdding(false) }}
          onBlur={() => setAdding(false)}>
          <option value="">choose an effect…</option>
          {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      )}
    </div>
  )
}
