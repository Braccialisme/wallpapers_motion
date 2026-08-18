import React, { useRef, useState } from 'react'
import { useStore } from '../store.js'

const DEPTH_DOT = { none: '', pending: 'busy', luminance: 'busy', model: 'ok', imported: 'ok', error: 'err' }

export default function LayersPanel({ onFiles }) {
  const { project, ui } = useStore()
  const setUI = useStore((s) => s.setUI)
  const removeLayer = useStore((s) => s.removeLayer)
  const moveLayer = useStore((s) => s.moveLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const updateLayer = useStore((s) => s.updateLayer)
  const fileRef = useRef()
  const [hot, setHot] = useState(false)

  // topmost layer first in the UI, painted last in the engine
  const ordered = [...project.layers].reverse()

  return (
    <div className="panel">
      <div className="sec">
        <h3>Layers <span className="spacer" />
          <button className="btn sm" onClick={() => fileRef.current.click()}>+ Image</button>
        </h3>
        <input ref={fileRef} type="file" accept="image/*" multiple
          onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />

        <div
          className={'drop' + (hot ? ' hot' : '')}
          onDragOver={(e) => { e.preventDefault(); setHot(true) }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => {
            e.preventDefault(); setHot(false)
            const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
            if (fs.length) onFiles(fs)
          }}
        >drop images here</div>
      </div>

      <div className="sec">
        {ordered.length === 0 && <div className="empty">no layers yet</div>}
        {ordered.map((l) => (
          <div
            key={l.id}
            className={'item' + (ui.selectedLayer === l.id ? ' sel' : '')}
            onClick={() => setUI({ selectedLayer: l.id })}
          >
            {l.src
              ? <img className="thumb" src={l.src} alt="" />
              : <div className="thumb" />}
            <span className="nm" style={{ opacity: l.visible ? 1 : 0.4 }}>{l.name}</span>
            <span className={'dot ' + (DEPTH_DOT[l.depthState] || '')} title={'depth: ' + l.depthState} />
            <button className="btn sm" title="hide"
              onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }) }}>
              {l.visible ? '👁' : '–'}
            </button>
          </div>
        ))}
      </div>

      {ui.selectedLayer && (
        <div className="sec">
          <h3>Order</h3>
          <div className="row">
            <button className="btn sm grow" onClick={() => moveLayer(ui.selectedLayer, 1)}>bring fwd</button>
            <button className="btn sm grow" onClick={() => moveLayer(ui.selectedLayer, -1)}>send back</button>
          </div>
          <div className="row">
            <button className="btn sm grow" onClick={() => duplicateLayer(ui.selectedLayer)}>duplicate</button>
            <button className="btn sm grow" onClick={() => removeLayer(ui.selectedLayer)}>delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
