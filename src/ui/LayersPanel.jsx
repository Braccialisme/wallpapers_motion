import React, { useRef, useState } from 'react'
import { useStore } from '../store.js'
import { MODELS } from '../engine/depth.js'
import ColorWheel from './ColorWheel.jsx'

const DEFAULT_DEPTH_COL = [0.93, 0.89, 0.82]   // the beige emboss ghost default

const DOT = { none: '', pending: 'busy', luminance: 'busy', model: 'ok', imported: 'ok', error: 'err' }
const DEPTH_LABEL = { none: 'no depth', pending: 'estimating…', luminance: 'rough depth',
  model: 'depth ok', imported: 'imported', error: 'depth failed' }

export default function LayersPanel({ onFiles, onRedepthAll, onFitAll, onFillWall, onCutSubject, onAddText }) {
  const { project, ui, depth } = useStore()
  const setUI = useStore((s) => s.setUI)
  const setDepth = useStore((s) => s.setDepth)
  const removeLayer = useStore((s) => s.removeLayer)
  const moveLayer = useStore((s) => s.moveLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const updateLayer = useStore((s) => s.updateLayer)
  const copyChain = useStore((s) => s.copyChain)
  const pasteChain = useStore((s) => s.pasteChain)
  const clearLayerEffects = useStore((s) => s.clearLayerEffects)
  const toggleRawPhotos = useStore((s) => s.toggleRawPhotos)
  const parade = useStore((s) => s.parade)
  const mosaic = useStore((s) => s.mosaic)
  const setDepthColour = useStore((s) => s.setDepthColour)
  const [showDepthCol, setShowDepthCol] = useState(false)
  // current depth colour: the remembered global, else the first layer's emboss tint, else default
  const firstEmboss = project.layers.flatMap((l) => l.effects || []).find((f) => f.type === 'emboss')
  const depthColour = ui.depthColour || firstEmboss?.params?.tint || DEFAULT_DEPTH_COL
  const hasClip = !!ui.fxClipboard
  const fileRef = useRef()
  const fontRef = useRef()
  const [hot, setHot] = useState(false)
  const [text, setText] = useState('shimmer')
  const [font, setFont] = useState(null)

  const ordered = [...project.layers].reverse()   // topmost first
  const sel = ui.selectedLayer

  return (
    <div className="panel">
      <div className="sec">
        <div className="sec-title">Layers<span className="spacer" />
          <button className={'btn sm' + (ui.rawPhotos ? ' on' : '')}
            title="show your plain placed photos (turns the reveal/emboss ghost off on every layer). Click again to bring the reveal back."
            onClick={toggleRawPhotos}>{ui.rawPhotos ? 'Photos ●' : 'Photos ○'}</button>
          <button className="btn sm" title="filmstrip: pack all photos full-size edge to edge and scroll them across the wall over the timeline — a new picture always arriving, never any paper" onClick={parade}>Parade ▶</button>
          <button className="btn sm" title="fit all photos into a recursive subdivided grid (messy but not too much) — click again to reshuffle" onClick={mosaic}>Mosaic ▦</button>
          <button className="btn sm" title="cover-crop every layer edge to edge to fill the wall at once — no gaps, no paper" onClick={onFillWall}>Fill wall</button>
          <button className="btn sm" title="tile every layer side by side inside the frame (may leave paper gaps)" onClick={onFitAll}>Fit all</button>
          <button className="btn sm" onClick={() => fileRef.current.click()}>Add</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple
          onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />

        {/* text → glyph layer (pair with the Saber preset to make it light up) */}
        <div className="row" style={{ marginTop: 8, gap: 6 }}>
          <input type="text" value={text} placeholder="text…" style={{ flex: 1, minWidth: 0 }}
            onChange={(e) => setText(e.target.value)} />
          <button className={'btn sm' + (font ? ' on' : '')} title="load a .ttf/.otf font file"
            onClick={() => fontRef.current.click()}>{font ? 'font ✓' : 'font…'}</button>
          <button className="btn sm" title="add the text as a glyph layer — then apply the Saber preset to light it up"
            disabled={!font || !text} onClick={() => onAddText?.(text, font)}>Add text</button>
        </div>
        <input ref={fontRef} type="file" accept=".ttf,.otf,.woff" style={{ display: 'none' }}
          onChange={(e) => { setFont(e.target.files[0] || null); e.target.value = '' }} />

        {/* global depth / ghost colour — recolours the beige on every layer at once (wheel + hex) */}
        <div className="row" style={{ marginTop: 8, alignItems: 'center', gap: 8 }}>
          <button className="btn sm" title="the beige 'depth' colour on every layer — click for wheel + hex"
            onClick={() => setShowDepthCol((v) => !v)}>Depth colour {showDepthCol ? '▾' : '▸'}</button>
          <div className="cw-sw" style={{ width: 20, height: 20, borderRadius: 4,
            background: `rgb(${depthColour.map((c) => Math.round(c * 255)).join(',')})` }} />
        </div>
        {showDepthCol && <ColorWheel value={depthColour} onChange={setDepthColour} />}

        {ordered.length === 0 && (
          <div className={'drop' + (hot ? ' hot' : '')}
            onDragOver={(e) => { e.preventDefault(); setHot(true) }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setHot(false)
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
          <>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm grow" title="bring forward" onClick={() => moveLayer(sel, 1)}>↑</button>
            <button className="btn sm grow" title="send back" onClick={() => moveLayer(sel, -1)}>↓</button>
            <button className="btn sm grow" title="duplicate layer" onClick={() => duplicateLayer(sel)}>dup</button>
            <button className="btn sm grow" onClick={() => removeLayer(sel)}>del</button>
          </div>
          <div className="row">
            <button className="btn sm grow" title="copy this layer's effect chain + keyframes" onClick={() => copyChain(sel)}>copy FX</button>
            <button className="btn sm grow" title="paste the copied effect chain onto this layer" disabled={!hasClip} onClick={() => pasteChain(sel)}>paste FX</button>
            <button className="btn sm grow" title="remove ALL effects on this layer (stops drift/warp/reveal)" onClick={() => clearLayerEffects(sel)}>clear FX</button>
          </div>
          <div className="row">
            <button className="btn sm grow" title="cut the subject out — background becomes transparent so it floats on the paper (@imgly/background-removal)" onClick={() => onCutSubject?.(sel)}>Cut subject ✂</button>
          </div>
          </>
        )}
      </div>

      <div className="sec">
        <div className="sec-title">Depth engine</div>
        <div className="card">
          <div className="prm">
            <div className="prm-top">
              <span className="prm-lbl">Source</span>
              <span className="prm-val">{depth.source}</span>
            </div>
            <select style={{ width: '100%' }} value={depth.source}
              onChange={(e) => setDepth({ source: e.target.value })}>
              <option value="relief">Relief — carvings, flat subjects</option>
              <option value="scene">Scene — real space, arches, caves</option>
              <option value="hybrid">Hybrid — layout + surface detail</option>
            </select>
            <div style={{ color: 'var(--faint)', fontSize: 10.5, marginTop: 6, lineHeight: 1.5 }}>
              {depth.source === 'relief' && 'Height from shading. No model needed — instant.'}
              {depth.source === 'scene' && 'Monocular depth. Needs real distance in the shot.'}
              {depth.source === 'hybrid' && 'Large shapes from the model, detail from shading.'}
            </div>
          </div>

          {depth.source !== 'relief' && (
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
          )}

          {depth.source !== 'scene' && (
            <>
              <div className="prm">
                <div className="prm-top">
                  <span className="prm-lbl">Relief scale</span>
                  <span className="prm-val">{depth.reliefScale}</span>
                </div>
                <input type="range" min={4} max={90} step={1} value={depth.reliefScale}
                  onChange={(e) => setDepth({ reliefScale: Number(e.target.value) })} />
              </div>
              <div className="prm">
                <div className="prm-top">
                  <span className="prm-lbl">Relief strength</span>
                  <span className="prm-val">{depth.reliefGain.toFixed(2)}</span>
                </div>
                <input type="range" min={0.1} max={4} step={0.05} value={depth.reliefGain}
                  onChange={(e) => setDepth({ reliefGain: Number(e.target.value) })} />
              </div>
            </>
          )}

          {depth.source === 'scene' && depth.refine && (
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
                  <span className="prm-lbl">Edge lock</span>
                  <span className="prm-val">{depth.eps.toFixed(3)}</span>
                </div>
                <input type="range" min={0.002} max={0.12} step={0.002} value={depth.eps}
                  onChange={(e) => setDepth({ eps: Number(e.target.value) })} />
              </div>
            </>
          )}

          <div className="prm">
            <div className="prm-top"><span className="prm-lbl">Invert</span></div>
            <div className="seg">
              <button className={depth.invert ? '' : 'on'} onClick={() => setDepth({ invert: false })}>off</button>
              <button className={depth.invert ? 'on' : ''} onClick={() => setDepth({ invert: true })}>on</button>
            </div>
          </div>

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
