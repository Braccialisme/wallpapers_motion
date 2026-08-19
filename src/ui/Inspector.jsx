import React, { useState } from 'react'
import { useStore, pathT } from '../store.js'
import EffectChain from './EffectChain.jsx'
import ParamRow from './ParamRow.jsx'

const T_DEFS = {
  x:       { type: 'float', min: -6000, max: 6000, step: 1, label: 'Position X' },
  y:       { type: 'float', min: -3000, max: 3000, step: 1, label: 'Position Y' },
  scale:   { type: 'float', min: 0.02, max: 6, step: 0.005, label: 'Scale' },
  rot:     { type: 'float', min: -180, max: 180, step: 0.5, label: 'Rotation' },
  opacity: { type: 'float', min: 0, max: 1, step: 0.01, label: 'Opacity' },
}

function CursorCard() {
  const cursor = useStore((s) => s.project.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const setUI = useStore((s) => s.setUI)
  const cursorEdit = useStore((s) => s.ui.cursorEdit)
  const removeCursorPoint = useStore((s) => s.removeCursorPoint)
  const addCursorPoint = useStore((s) => s.addCursorPoint)
  const duration = useStore((s) => s.project.duration)
  const n = cursor?.points?.length || 0

  const brushes = [
    { name: 'Soft',  shape: 0, spread: 0.22, softness: 0.75 },
    { name: 'Sharp', shape: 0, spread: 0.12, softness: 0.15 },
    { name: 'Brush', shape: 1, spread: 0.28, softness: 0.5 },
    { name: 'Dot',   shape: 2, spread: 0.08, softness: 0.4 },
  ]
  const setPath = (pts) => {
    const cur = useStore.getState().project.cursor
    ;(cur.points || []).slice().forEach((_, i, a) => removeCursorPoint(a.length - 1 - i))
    setCursor({ enabled: true })
    pts.forEach((p) => addCursorPoint(p.t * duration, p.x, p.y))
  }
  const paths = {
    'Sweep →':  [{t:0,x:0.03,y:0.5},{t:1,x:0.97,y:0.5}],
    'Diagonal': [{t:0,x:0.03,y:0.15},{t:1,x:0.97,y:0.85}],
    'Down ↓':   [{t:0,x:0.5,y:0.03},{t:1,x:0.5,y:0.97}],
    'Zigzag':   [{t:0,x:0.03,y:0.2},{t:0.33,x:0.36,y:0.8},{t:0.66,x:0.7,y:0.2},{t:1,x:0.97,y:0.8}],
    'Circle':   Array.from({length:9},(_, i)=>({t:i/8, x:0.5+0.42*Math.cos(i/8*6.283), y:0.5+0.42*Math.sin(i/8*6.283)})),
  }
  return (
    <div className="card">
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Reveal cursor</span></div>
        <div className="seg">
          <button className={cursor?.enabled ? '' : 'on'} onClick={() => setCursor({ enabled: false })}>off</button>
          <button className={cursor?.enabled ? 'on' : ''} onClick={() => setCursor({ enabled: true })}>on</button>
        </div>
      </div>
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Shape</span></div>
        <div className="seg">
          {['circle', 'brush', 'dot'].map((sh, i) => (
            <button key={sh} className={Math.round(cursor?.shape || 0) === i ? 'on' : ''}
              onClick={() => setCursor({ shape: i })}>{sh}</button>
          ))}
        </div>
      </div>
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Spread</span><span className="prm-val">{(cursor?.spread ?? 0.16).toFixed(2)}</span></div>
        <input type="range" min={0.03} max={0.6} step={0.01} value={cursor?.spread ?? 0.16}
          onChange={(e) => setCursor({ spread: Number(e.target.value) })} />
      </div>
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Softness</span><span className="prm-val">{(cursor?.softness ?? 0.5).toFixed(2)}</span></div>
        <input type="range" min={0} max={1} step={0.02} value={cursor?.softness ?? 0.5}
          onChange={(e) => setCursor({ softness: Number(e.target.value) })} />
      </div>
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Falloff (edge fade)</span><span className="prm-val">{(cursor?.falloff ?? 0.6).toFixed(2)}</span></div>
        <input type="range" min={0} max={3} step={0.05} value={cursor?.falloff ?? 0.6}
          onChange={(e) => setCursor({ falloff: Number(e.target.value) })} />
      </div>
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Brush presets</span></div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {brushes.map((b) => (
            <button key={b.name} className="btn sm"
              onClick={() => setCursor({ shape: b.shape, spread: b.spread, softness: b.softness })}>{b.name}</button>
          ))}
        </div>
      </div>
      <div className="prm">
        <div className="prm-top"><span className="prm-lbl">Path presets</span></div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(paths).map(([name, pts]) => (
            <button key={name} className="btn sm" onClick={() => setPath(pts)}>{name}</button>
          ))}
        </div>
      </div>
      <button className={'btn sm' + (cursorEdit ? ' on' : '')} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}
        onClick={() => setUI({ cursorEdit: !cursorEdit })}>
        {cursorEdit ? 'Editing path — click canvas to add points' : 'Edit path on canvas'}
      </button>
      <div style={{ color: 'var(--faint)', fontSize: 10.5, marginTop: 8, lineHeight: 1.5 }}>
        {n} point{n === 1 ? '' : 's'}. Scrub the time, click the canvas to drop the cursor where it
        should be at that moment; drag points to adjust, double-click to remove. Then give each layer a
        Scatter Reveal with driver “travel (cursor)”.
        {n > 0 && <button className="btn sm" style={{ marginTop: 6 }} onClick={() => { while ((useStore.getState().project.cursor.points || []).length) removeCursorPoint(0) }}>clear path</button>}
      </div>
    </div>
  )
}

export default function Inspector({ onRedepth }) {
  const { project, ui } = useStore()
  const updateTransform = useStore((s) => s.updateTransform)
  const updateLayer = useStore((s) => s.updateLayer)
  const layer = project.layers.find((l) => l.id === ui.selectedLayer)
  const [tab, setTab] = useState('layer')

  return (
    <div className="panel right">
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === 'layer' ? 'on' : ''} onClick={() => setTab('layer')}>Layer</button>
        <button className={tab === 'global' ? 'on' : ''} onClick={() => setTab('global')}>Global</button>
      </div>

      {tab === 'global' && (
        <div className="sec">
          <div className="sec-title">Global chain</div>
          <EffectChain target="global" effects={project.globalEffects} />
        </div>
      )}

      {tab === 'global' && (
        <div className="sec">
          <div className="sec-title">Traveling reveal</div>
          <CursorCard />
        </div>
      )}

      {tab === 'layer' && (!layer ? (
        <div className="empty">Select a layer to edit it</div>
      ) : (
        <>
          <div className="sec">
            <div className="sec-title">
              {layer.name}<span className="spacer" />
              <span className="mono" style={{ color: 'var(--faint)', fontSize: 10 }}>
                {layer.imgW}×{layer.imgH}
              </span>
            </div>
            <div className="card">
              <input type="text" style={{ width: '100%' }} value={layer.name}
                onChange={(e) => updateLayer(layer.id, { name: e.target.value })} />
              <div className="prm">
                <div className="prm-top"><span className="prm-lbl">Blend</span></div>
                <select style={{ width: '100%' }} value={layer.blend}
                  onChange={(e) => updateLayer(layer.id, { blend: e.target.value })}>
                  {['normal', 'add', 'multiply', 'screen'].map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="row">
                <button className="btn sm grow" onClick={() => onRedepth(layer.id)}>Re-estimate depth</button>
              </div>
            </div>
          </div>

          <div className="sec">
            <div className="sec-title">Transform</div>
            <div className="card">
              {Object.entries(T_DEFS).map(([k, def]) => (
                <ParamRow key={k} def={def} pkey={k}
                  value={layer.transform[k]}
                  onChange={(v) => updateTransform(layer.id, { [k]: v })}
                  kfPath={pathT(layer.id, k)} />
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm grow" onClick={() => updateTransform(layer.id, { x: 0, y: 0 })}>Centre</button>
                <button className="btn sm grow" onClick={() => updateTransform(layer.id, {
                  scale: project.canvas.h / (layer.imgH || project.canvas.h),
                })}>Fit height</button>
              </div>
            </div>
          </div>

          <div className="sec">
            <div className="sec-title">Effects</div>
            <EffectChain target={layer.id} effects={layer.effects} />
          </div>
        </>
      ))}
    </div>
  )
}
