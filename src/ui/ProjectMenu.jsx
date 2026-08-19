import React, { useEffect, useState, useRef } from 'react'
import { useStore } from '../store.js'
import { listProjects, putProject, getProject, deleteProject } from '../engine/storage.js'

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export default function ProjectMenu({ onLoad }) {
  const project = useStore((s) => s.project)
  const setProject = useStore((s) => s.setProject)
  const setUI = useStore((s) => s.setUI)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const ref = useRef()

  const refresh = () => listProjects().then(setRows)
  useEffect(() => { if (open) refresh() }, [open])

  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [])

  const save = async (name) => {
    const n = (name ?? project.name ?? 'untitled').trim() || 'untitled'
    if (n !== project.name) setProject({ name: n })
    await putProject(n, { ...project, name: n })
    setUI({ status: `saved “${n}”` })
    refresh()
  }

  const load = async (name) => {
    const p = await getProject(name)
    if (p) { onLoad(p); setUI({ status: `opened “${name}”` }) }
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)}>
        {project.name || 'untitled'} ▾
      </button>

      {open && (
        <div className="card" style={{
          position: 'absolute', top: 36, left: 0, width: 290, zIndex: 40,
          boxShadow: '0 18px 50px rgba(0,0,0,.6)',
        }}>
          <div className="row">
            <input type="text" className="grow" value={project.name || ''}
              placeholder="project name"
              onChange={(e) => setProject({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
            <button className="btn sm pri" onClick={() => save()}>Save</button>
          </div>

          <div className="sec-title" style={{ margin: '14px 0 8px' }}>Saved projects</div>
          {rows.length === 0 && <div className="empty" style={{ padding: 10 }}>nothing saved yet</div>}
          {rows.map((r) => (
            <div className="tile" key={r.name} style={{ padding: 8 }}>
              <div className="meta" onClick={() => load(r.name)} style={{ cursor: 'pointer' }}>
                <div className="nm">{r.name}</div>
                <div className="sub">{ago(r.savedAt)}</div>
              </div>
              <button className="btn ico" title="delete"
                onClick={async () => { await deleteProject(r.name); refresh() }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
