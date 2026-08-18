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

  const scope = target === 'global' ? 'global' : 'layer'
  const available = effectList(scope)

  return (
    <div>
      {effects.length === 0 && <div className="empty">no effects — add one below</div>}

      {effects.map((fx, i) => {
        const def = getEffect(fx.type)
        if (!def) return (
          <div className="fx" key={fx.id}>
            <div className="fx-head"><span className="nm">unknown: {fx.type}</span>
              <button className="btn sm" onClick={() => removeEffect(target, fx.id)}>✕</button></div>
          </div>
        )
        const isOpen = open[fx.id] ?? i === effects.length - 1
        return (
          <div className="fx" key={fx.id}>
            <div className="fx-head" onClick={() => setOpen((o) => ({ ...o, [fx.id]: !isOpen }))}>
              <span style={{ color: 'var(--tx3)' }}>{isOpen ? '▾' : '▸'}</span>
              <span className="nm" style={{ opacity: fx.enabled ? 1 : 0.45 }}>{def.name}</span>
              <button className={'btn sm' + (fx.enabled ? ' on' : '')} title="mute"
                onClick={(e) => { e.stopPropagation(); updateEffect(target, fx.id, { enabled: !fx.enabled }) }}>
                {fx.enabled ? '●' : '○'}
              </button>
              <button className="btn sm" title="up"
                onClick={(e) => { e.stopPropagation(); moveEffect(target, fx.id, -1) }}>↑</button>
              <button className="btn sm" title="down"
                onClick={(e) => { e.stopPropagation(); moveEffect(target, fx.id, 1) }}>↓</button>
              <button className="btn sm" title="remove"
                onClick={(e) => { e.stopPropagation(); removeEffect(target, fx.id) }}>✕</button>
            </div>
            {isOpen && (
              <div className="fx-body">
                {Object.entries(def.params).map(([k, p]) => (
                  <ParamRow
                    key={k} def={p} pkey={k}
                    value={fx.params[k] ?? p.default}
                    onChange={(v) => setParam(target, fx.id, k, v)}
                    kfPath={target === 'global' ? pathG(fx.id, k) : pathE(target, fx.id, k)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {!adding ? (
        <button className="btn" style={{ width: '100%' }} onClick={() => setAdding(true)}>+ Effect</button>
      ) : (
        <select
          autoFocus style={{ width: '100%' }} defaultValue=""
          onChange={(e) => { if (e.target.value) addEffect(target, e.target.value); setAdding(false) }}
          onBlur={() => setAdding(false)}
        >
          <option value="">choose…</option>
          {available.map((e) => <option key={e.id} value={e.id}>{e.category} · {e.name}</option>)}
        </select>
      )}
    </div>
  )
}
