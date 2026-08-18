// Full-resolution export.
// Each frame is rendered offscreen at the real wall size and POSTed to the vite
// dev server, which writes it to disk and calls the local ffmpeg at the end.
//
// renderFrame(t, w, h) -> Promise<Blob>   (caller bakes keyframes for time t)

export async function exportVideo(renderFrame, { w, h, fps = 24, duration = 10, name = 'wall' }, { onProgress, signal } = {}) {
  const total = Math.max(1, Math.round(duration * fps))

  const start = await fetch('/api/export/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, fps }),
  }).then((r) => r.json())
  if (!start.ok) throw new Error('export start failed: ' + JSON.stringify(start))

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error('export cancelled')
    const blob = await renderFrame(i / fps, w, h)
    const res = await fetch('/api/export/frame', { method: 'POST', body: blob })
    if (!res.ok) throw new Error('frame upload failed at ' + i)
    onProgress?.({ frame: i + 1, total, phase: 'render' })
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0)) // keep UI alive
  }

  onProgress?.({ frame: total, total, phase: 'encoding' })
  const fin = await fetch('/api/export/finish', { method: 'POST' }).then((r) => r.json())
  if (!fin.ok) throw new Error('ffmpeg failed: ' + JSON.stringify(fin))
  onProgress?.({ frame: total, total, phase: 'done', file: fin.file })
  return fin.file
}

/** Single full-res still, downloaded in the browser. */
export async function exportStill(renderFrame, { w, h }, time, name = 'still') {
  const blob = await renderFrame(time, w, h)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}_${w}x${h}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
