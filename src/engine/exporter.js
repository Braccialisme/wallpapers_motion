// Full-resolution export, two routes:
//
//  1. dev server present  -> stream PNG frames to disk, encode with local ffmpeg.
//     Best quality, no memory ceiling, handles any wall width.
//  2. hosted (GitHub Pages) -> encode in the browser with WebCodecs + mp4-muxer.
//     No server needed; limited by what the GPU encoder accepts.
//
// renderFrame(t, w, h) -> Promise<Blob>   (caller bakes keyframes for time t)


// Yield to the browser between frames. setTimeout is clamped to ~1s in background
// tabs, which would make a long export crawl if the user switches away; a
// MessageChannel round-trip is a real macrotask that is not throttled.
const yieldToBrowser = () => new Promise((resolve) => {
  const ch = new MessageChannel()
  ch.port1.onmessage = () => { ch.port1.close(); resolve() }
  ch.port2.postMessage(0)
})

async function hasDevServer() {
  try {
    const r = await fetch('/api/export/ping', { method: 'POST' })
    // the middleware answers 404 json for unknown routes; a static host answers html
    return (r.headers.get('content-type') || '').includes('application/json')
  } catch { return false }
}

// ---------------------------------------------------------------- ffmpeg route
async function exportViaServer(renderFrame, { w, h, fps, duration, name }, onProgress, signal) {
  const total = Math.max(1, Math.round(duration * fps))
  const start = await fetch('/api/export/start', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, fps }),
  }).then((r) => r.json())
  if (!start.ok) throw new Error('export start failed')

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new Error('cancelled')
    const blob = await renderFrame(i / fps, w, h)
    const res = await fetch('/api/export/frame', { method: 'POST', body: blob })
    if (!res.ok) throw new Error('frame upload failed at ' + i)
    onProgress?.({ frame: i + 1, total, phase: 'render' })
    if (i % 4 === 0) await yieldToBrowser()
  }
  onProgress?.({ frame: total, total, phase: 'encoding' })
  const fin = await fetch('/api/export/finish', { method: 'POST' }).then((r) => r.json())
  if (!fin.ok) throw new Error('ffmpeg failed')
  onProgress?.({ frame: total, total, phase: 'done', file: fin.file })
  return fin.file
}

// ------------------------------------------------------------ webcodecs route
async function exportViaWebCodecs(renderFrame, { w, h, fps, duration, name }, onProgress, signal) {
  if (typeof VideoEncoder === 'undefined')
    throw new Error('this browser has no WebCodecs — run the tool locally to export')

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const total = Math.max(1, Math.round(duration * fps))

  // Very wide walls exceed what hardware H.264 will accept; check before rendering 500 frames.
  const cfg = {
    codec: 'avc1.640034', width: w, height: h,
    bitrate: Math.min(80_000_000, Math.round(w * h * fps * 0.12)),
    framerate: fps,
  }
  const support = await VideoEncoder.isConfigSupported(cfg)
  if (!support.supported)
    throw new Error(`the browser encoder will not accept ${w}×${h}. Run locally for full size, or export a smaller wall.`)

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory',
  })
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e },
  })
  encoder.configure(cfg)

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) { encoder.close(); throw new Error('cancelled') }
    const blob = await renderFrame(i / fps, w, h)
    const bitmap = await createImageBitmap(blob)
    const frame = new VideoFrame(bitmap, {
      timestamp: Math.round((i * 1e6) / fps),
      duration: Math.round(1e6 / fps),
    })
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
    frame.close(); bitmap.close()
    onProgress?.({ frame: i + 1, total, phase: 'render' })
    // don't let the encoder queue run away with memory
    while (encoder.encodeQueueSize > 8) await yieldToBrowser()
    if (i % 4 === 0) await yieldToBrowser()
  }

  onProgress?.({ frame: total, total, phase: 'encoding' })
  await encoder.flush()
  encoder.close()
  muxer.finalize()

  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}_${w}x${h}.mp4`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 8000)
  onProgress?.({ frame: total, total, phase: 'done', file: a.download })
  return a.download
}

export async function exportVideo(renderFrame, opts, { onProgress, signal } = {}) {
  const local = await hasDevServer()
  onProgress?.({ frame: 0, total: 1, phase: local ? 'starting (ffmpeg)' : 'starting (browser)' })
  return local
    ? exportViaServer(renderFrame, opts, onProgress, signal)
    : exportViaWebCodecs(renderFrame, opts, onProgress, signal)
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
