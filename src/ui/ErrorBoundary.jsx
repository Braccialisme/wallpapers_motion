import React from 'react'

// Never white-screen. A render error is caught here; the project state and the on-disk
// autosave are untouched, so reloading restores the work.
export default class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error('[ui error]', err, info) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0b', color: '#f5f5f5', flexDirection: 'column', gap: 16, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: 20, fontWeight: 650 }}>Something glitched in the UI</div>
        <div style={{ color: '#a8a8ad', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
          Your work is safe — it is autosaved. Reload to continue from where you were.
        </div>
        <div style={{ color: '#8a8a92', fontSize: 12, fontFamily: 'monospace', maxWidth: 500, textAlign: 'center' }}>
          {String(this.state.err?.message || this.state.err)}
        </div>
        <button onClick={() => location.reload()} style={{ padding: '10px 22px', borderRadius: 999,
          background: '#fff', color: '#0a0a0b', border: 'none', fontWeight: 650, cursor: 'pointer' }}>
          Reload
        </button>
      </div>
    )
  }
}
