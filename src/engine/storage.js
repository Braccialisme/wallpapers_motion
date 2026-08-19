// Project persistence in IndexedDB.
//
// Projects carry their images inline as data URLs, so they are far too big for
// localStorage. IndexedDB holds them comfortably. Two things live here:
//   - an autosave slot, written continuously so a crash or reload costs nothing
//   - named projects, so a small change never means rebuilding from scratch

const DB = 'shimmerlab'
const STORE = 'projects'
const AUTOSAVE = '__autosave__'

let dbPromise = null
function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'name' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx(mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    let result
    try { result = fn(store) } catch (e) { reject(e); return }
    t.oncomplete = () => resolve(result?.result ?? result)
    t.onerror = () => reject(t.error)
  })
}

export const putProject = (name, project) =>
  tx('readwrite', (s) => s.put({ name, project, savedAt: Date.now() }))

export const getProject = (name) =>
  tx('readonly', (s) => s.get(name)).then((r) => r?.project ?? null)

export const deleteProject = (name) => tx('readwrite', (s) => s.delete(name))

export const listProjects = () =>
  tx('readonly', (s) => s.getAll()).then((rows) =>
    (rows || [])
      .filter((r) => r.name !== AUTOSAVE)
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((r) => ({ name: r.name, savedAt: r.savedAt })))

export const saveAutosave = (project) => putProject(AUTOSAVE, project)
export const loadAutosave = () => getProject(AUTOSAVE)

/** Trailing debounce — the autosave should not fight a slider drag. */
export function debounce(fn, ms = 700) {
  let t
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
  wrapped.flush = (...a) => { clearTimeout(t); fn(...a) }
  return wrapped
}
