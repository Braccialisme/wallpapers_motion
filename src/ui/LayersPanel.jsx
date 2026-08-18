import React, { useRef, useState } from 'react'
import { useStore } from '../store.js'
import { MODELS } from '../engine/depth.js'

const DOT = { none: '', pending: 'busy', luminance: 'busy', model: 'ok', imported: 'ok', error: 'err' }
const DEPTH_LABEL = { none: 'no depth', pending: 'estimating…', luminance: 'rough depth',
  model: 'depth ok', imported: 'imported', error: 'depth failed' }

export default function LayersPanel({ onFiles, onRedepthAll }) {
  const { project, ui, depth } = useStore()
  const setUI = useStore((s) => s.setUI)
  const setDepth = useStore((s) => s.setDepth)
  const removeLayer = useStore((s) => s.removeLayer)
  const moveLayer = useStore((s) => s.moveLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const updateLayer = useStore((s) => s.updateLayer)
  const fileRef = useRef()
  const [hot, setHot] = useState(false)

  const ordered = [...project.layers].reverse()   // topmost first
  const sel = ui.selectedLayer

  return (
    <div className="panel">
      <div className="sec">
        <div className="sec-title">Layers<span className="spacer" />
          <button className="btn sm" onClick={() => fileRef.current.click()}>Add</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple
          onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />

        {ordered.length === 0 && (
          <div className={'drop' + (hot ? ' hot' : '')}
            onDragOver={(e) => { e.preventDefault(); setHot(true) }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => { e.preventDefault(); setHot(false)
              const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
              if (fs.length) onFiles(fs) }}
          >Drop images here</div>
        )}

        {ordered.map((l) => (
          <div key={l.id}
            className={'tile' + (sel === l.id ? ' sel' : '') + (l.visible ? '' : ' hidden')}
            onClick={() => setUI({ selectedLayer: l.id })}
          >
            {l.src ? <img className="thumb" src={l.src} alt="" /> : <div className="thumb" />}
            <div className="meta">
              <div className="nm">{l.name}</div>
              <div className="sub"><span className={'dot ' + (DOT[l.depthState] || '')} /> {DEPTH_LABEL[l.depthState] || l.depthState}</div>
            </div>
            <button className="btn ico" title="show / hide"
              onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }) }}>
              {l.visible ? '◉' : '○'}
            </button>
          </div>
        ))}

        {sel && (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm grow" title="bring forward" onClick={() => moveLayer(sel, 1)}>↑</button>
            <button className="btn sm grow" title="send back" onClick={() => moveLayer(sel, -1)}>↓</button>
            <button className="btn sm grow" onClick={() => duplicateLayer(sel)}>copy</button>
            <button className="btn sm grow" onClick={() => removeLayer(sel)}>del</button>
          </div>
        )}
      </div>

      <div className="sec">
        <div className="sec-title">Depth engine</div>
        <div className="card">
          <div className="prm">
            <div className="prm-top"><span className="prm-lbl">Model</span></div>
            <div className="seg">
              {Object.entries(MODELS).map(([k, m]) => (
                <button key={k} className={depth.model === k ? 'on' : ''}
                  title={`${m.label} — about ${m.mb} MB, cached after first use`}
                  onClick={() => setDepth({ model: k })}>{k}</button>
              ))}
            </div>
          </div>

          <div className="prm">
            <div className="prm-top"><span className="prm-lbl">Edge refine</span></div>
            <div className="seg">
              <button className={depth.refine ? '' : 'on'} onClick={() => setDepth({ refine: false })}>off</button>
              <button className={depth.refine ? 'on' : ''} onClick={() => setDepth({ refine: true })}>on</button>
            </div>
          </div>

          {depth.refine && (
            <>
              <div className="prm">
                <div className="prm-top">
                  <span className="prm-lbl">Edge radius</span>
                  <span className="prm-val">{depth.radius}</span>
                </div>
                <input type="range" min={2} max={30} step={1} value={depth.radius}
                  onChange={(e) => setDepth({ radius: Number(e.target.value) })} />
              </div>
              <div className="prm">
                <div className="prm-top">
                  <span className="prm-lbl">Sharpness</span>
                  <span className="prm-val">{depth.eps.toFixed(4)}</span>
                </div>
                <input type="range" min={0.0002} max={0.02} step={0.0002} value={depth.eps}
                  onChange={(e) => setDepth({ eps: Number(e.target.value) })} />
              </div>
            </>
          )}

          <button className="btn sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            onClick={onRedepthAll} disabled={!project.layers.length}>
            Re-estimate all
          </button>
          <div className="sub" style={{ color: 'var(--faint)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
            press <span className="kbd">D</span> to inspect depth
          </div>
        </div>
      </div>
    </div>
  )
}
