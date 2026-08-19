// Save / open projects as real files on the local disk.
//
// Uses the File System Access API (Chrome/Edge): a native Save dialog, a file handle we
// keep so "Save" overwrites the same file, and a native Open dialog. Falls back to a
// plain download / file-input where the API is missing (e.g. Firefox, Safari).
//
// This is the durable store — the browser IndexedDB autosave is only a crash net.

export const fsSupported = typeof window !== 'undefined' && 'showSaveFilePicker' in window

const TYPES = [{ description: 'ShimmerLab project', accept: { 'application/json': ['.json'] } }]

export async function pickSave(suggestedName = 'wall') {
  return await window.showSaveFilePicker({ suggestedName: `${suggestedName}.shimmer.json`, types: TYPES })
}

export async function pickOpen() {
  const [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false })
  return handle
}

export async function writeHandle(handle, project) {
  const w = await handle.createWritable()
  await w.write(new Blob([JSON.stringify(project)], { type: 'application/json' }))
  await w.close()
}

export async function readHandle(handle) {
  const file = await handle.getFile()
  return { project: JSON.parse(await file.text()), name: file.name.replace(/\.(shimmer\.)?json$/i, '') }
}

// --------- fallbacks for browsers without the File System Access API ----------
export function downloadProject(project, name = 'wall') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(project)], { type: 'application/json' }))
  a.download = `${name}.shimmer.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export function uploadProject() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return reject(new Error('no file'))
      try { resolve({ project: JSON.parse(await f.text()), name: f.name.replace(/\.(shimmer\.)?json$/i, '') }) }
      catch (e) { reject(e) }
    }
    input.click()
  })
}
