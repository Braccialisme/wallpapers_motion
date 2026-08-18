import React, { useEffect } from 'react'
import { useStore } from '../store.js'

export const KEYS = [
  ['Space', 'play / pause'],
  ['← →', 'step one frame'],
  ['⇧ ← →', 'jump one second'],
  ['Home / End', 'start / end'],
  ['D', 'toggle depth view'],
  ['L', 'toggle loop'],
  ['V', 'show / hide selected layer'],
  ['[ ]', 'select previous / next layer'],
  ['⌫', 'delete selected layer'],
  ['?', 'this list'],
]

/** Global keyboard control. Ignores events while typing in a field. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')
      if (typing && e.key !== 'Escape') return

      const s = useStore.getState()
      const { project, ui } = s
      const frame = 1 / (project.fps || 24)
      const clamp = (t) => Math.max(0, Math.min(project.duration, t))
      const step = (d) => { s.setUI({ time: clamp(ui.time + d), playing: false }); e.preventDefault() }

      switch (e.key) {
        case ' ': s.setUI({ playing: !ui.playing }); e.preventDefault(); break
        case 'ArrowRight': step(e.shiftKey ? 1 : frame); break
        case 'ArrowLeft': step(e.shiftKey ? -1 : -frame); break
        case 'Home': s.setUI({ time: 0, playing: false }); e.preventDefault(); break
        case 'End': s.setUI({ time: project.duration, playing: false }); e.preventDefault(); break
        case 'd': case 'D': s.setUI({ viewDepth: !ui.viewDepth }); break
        case 'l': case 'L': s.setUI({ loop: !ui.loop }); break
        case 'v': case 'V': {
          const l = project.layers.find((x) => x.id === ui.selectedLayer)
          if (l) s.updateLayer(l.id, { visible: !l.visible })
          break
        }
        case '[': case ']': {
          if (!project.layers.length) break
          const i = project.layers.findIndex((x) => x.id === ui.selectedLayer)
          const n = project.layers.length
          const j = e.key === ']' ? (i + 1 + n) % n : (i - 1 + n) % n
          s.setUI({ selectedLayer: project.layers[j === -1 ? 0 : j].id })
          break
        }
        case 'Backspace': case 'Delete':
          if (ui.selectedLayer) { s.removeLayer(ui.selectedLayer); e.preventDefault() }
          break
        case '?': s.setUI({ showHelp: true }); break
        case 'Escape': s.setUI({ showHelp: false }); break
        default: break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function HelpModal() {
  const showHelp = useStore((s) => s.ui.showHelp)
  const setUI = useStore((s) => s.setUI)
  if (!showHelp) return null
  return (
    <div className="modal" onClick={() => setUI({ showHelp: false })}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 19, fontWeight: 650, letterSpacing: '-.02em' }}>Keyboard</div>
        <div className="klist">
          {KEYS.map(([k, d]) => (
            <React.Fragment key={k}>
              <span className="kbd">{k}</span><span>{d}</span>
            </React.Fragment>
          ))}
        </div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}
          onClick={() => setUI({ showHelp: false })}>Close</button>
      </div>
    </div>
  )
}
