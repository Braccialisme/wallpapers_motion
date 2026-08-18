import React, { useRef, useEffect, useState } from 'react'

// HSV wheel: hue around, saturation outward. Value on the slider beside it.
// Colour params are stored as [r,g,b] floats 0..1 so they map straight to a vec3.

export function rgb2hsv([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h, max ? d / max : 0, max]
}

export function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}

const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))
export const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => to255(v).toString(16).padStart(2, '0')).join('')
export const fromHex = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

const SIZE = 104

export default function ColorWheel({ value, onChange }) {
  const canvasRef = useRef()
  const dragging = useRef(false)
  const rgb = Array.isArray(value) ? value : [1, 1, 1]
  const [h, s, v] = rgb2hsv(rgb)
  const [hex, setHex] = useState(toHex(rgb))

  useEffect(() => { setHex(toHex(rgb)) }, [rgb[0], rgb[1], rgb[2]])

  // the wheel itself only depends on value (brightness), so redraw when it changes
  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    const img = ctx.createImageData(SIZE, SIZE)
    const R = SIZE / 2
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - R + 0.5, dy = y - R + 0.5
        const dist = Math.sqrt(dx * dx + dy * dy)
        const i = (y * SIZE + x) * 4
        if (dist > R) { img.data[i + 3] = 0; continue }
        const hh = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1
        const ss = Math.min(1, dist / R)
        const [r, g, b] = hsv2rgb(hh, ss, v || 1)
        img.data[i] = to255(r); img.data[i + 1] = to255(g); img.data[i + 2] = to255(b)
        img.data[i + 3] = 255 * Math.min(1, (R - dist) / 1.5)   // soft edge
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [v])

  const pick = (e) => {
    const cv = canvasRef.current
    const rect = cv.getBoundingClientRect()
    const R = SIZE / 2
    const dx = ((e.clientX - rect.left) / rect.width) * SIZE - R
    const dy = ((e.clientY - rect.top) / rect.height) * SIZE - R
    const dist = Math.sqrt(dx * dx + dy * dy)
    const hh = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1
    const ss = Math.min(1, dist / R)
    onChange(hsv2rgb(hh, ss, v || 1))
  }

  useEffect(() => {
    const move = (e) => { if (dragging.current) pick(e) }
    const up = () => { dragging.current = false }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  })

  const R = SIZE / 2
  const cx = R + Math.cos(h * 2 * Math.PI) * s * R
  const cy = R + Math.sin(h * 2 * Math.PI) * s * R

  return (
    <div className="cw">
      <div style={{ position: 'relative', width: SIZE, height: SIZE, flex: 'none' }}>
        <canvas
          ref={canvasRef} width={SIZE} height={SIZE}
          onPointerDown={(e) => { dragging.current = true; pick(e) }}
        />
        <div style={{
          position: 'absolute', left: cx - 6, top: cy - 6, width: 12, height: 12,
          borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.6)',
          pointerEvents: 'none',
        }} />
      </div>

      <div className="cw-side">
        <div className="cw-sw" style={{ background: toHex(rgb) }} />
        <div className="prm-top" style={{ marginBottom: 4 }}>
          <span className="prm-lbl">brightness</span>
          <span className="prm-val">{v.toFixed(2)}</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.005} value={v}
          onChange={(e) => onChange(hsv2rgb(h, s, Number(e.target.value)))}
        />
        <input
          className="cw-hex" type="text" value={hex}
          onChange={(e) => {
            setHex(e.target.value)
            const c = fromHex(e.target.value)
            if (c) onChange(c)
          }}
        />
      </div>
    </div>
  )
}
