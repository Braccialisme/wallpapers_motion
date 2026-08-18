import React from 'react'
import { useStore, pathT } from '../store.js'
import EffectChain from './EffectChain.jsx'
import ParamRow from './ParamRow.jsx'

const T_DEFS = {
  x:       { type: 'float', min: -6000, max: 6000, step: 1, label: 'X px' },
  y:       { type: 'float', min: -3000, max: 3000, step: 1, label: 'Y px' },
  scale:   { type: 'float', min: 0.02, max: 6, step: 0.005, label: 'Scale' },
  rot:     { type: 'float', min: -180, max: 180, step: 0.5, label: 'Rotation°' },
  opacity: { type: 'float', min: 0, max: 1, step: 0.01, label: 'Opacity' },
}

export default function Inspector({ onRedepth }) {
  const { project, ui } = useStore()
  const updateTransform = useStore((s) => s.updateTransform)
  const updateLayer = useStore((s) => s.updateLayer)
  const layer = project.layers.find((l) => l.id === ui.selectedLayer)

  return (
    <div className="panel right">
      <div className="sec">
        <h3>Global chain</h3>
        <EffectChain target="global" effects={project.globalEffects} />
      </div>

      {!layer ? (
        <div className="empty">select a layer to edit it</div>
      ) : (
        <>
          <div className="sec">
            <h3>Layer <span className="spacer" />
              <span className="mono" style={{ color: 'var(--tx3)' }}>{layer.imgW}×{layer.imgH}</span>
            </h3>
            <div className="row">
              <input className="grow" style={{ background: '#0f1113', border: '1px solid var(--line)', borderRadius: 4, padding: '3px 6px' }}
                value={layer.name} onChange={(e) => updateLayer(layer.id, { name: e.target.value })} />
            </div>
            <div className="row">
              <span style={{ color: 'var(--tx2)' }}>blend</span>
              <select className="grow" value={layer.blend}
                onChange={(e) => updateLayer(layer.id, { blend: e.target.value })}>
                {['normal', 'add', 'multiply', 'screen'].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="row">
              <span style={{ color: 'var(--tx2)', flex: 1 }}>depth: {layer.depthState}</span>
              <button className="btn sm" onClick={() => onRedepth(layer.id)}>re-estimate</button>
            </div>
          </div>

          <div className="sec">
            <h3>Transform</h3>
            {Object.entries(T_DEFS).map(([k, def]) => (
              <ParamRow
                key={k} def={def} pkey={k}
                value={layer.transform[k]}
                onChange={(v) => updateTransform(layer.id, { [k]: v })}
                kfPath={pathT(layer.id, k)}
              />
            ))}
            <div className="row">
              <button className="btn sm grow" onClick={() => updateTransform(layer.id, { x: 0, y: 0 })}>center</button>
              <button className="btn sm grow" onClick={() => {
                const s = project.canvas.h / (layer.imgH || project.canvas.h)
                updateTransform(layer.id, { scale: s })
              }}>fit height</button>
            </div>
          </div>

          <div className="sec">
            <h3>Effect chain</h3>
            <EffectChain target={layer.id} effects={layer.effects} />
          </div>
        </>
      )}
    </div>
  )
}
