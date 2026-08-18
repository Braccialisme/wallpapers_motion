import * as THREE from 'three'

// Depth Anything V2 in the browser (WebGPU, falls back to WASM).
// Model weights are cached by the browser after the first download.
const CANDIDATES = [
  'onnx-community/depth-anything-v2-small',
  'Xenova/depth-anything-small-hf',
]

let pipePromise = null
let usedModel = null

export function depthModelName() { return usedModel }

// Only offer webgpu if an adapter really exists. navigator.gpu can be present while
// requestAdapter() returns null (virtual displays, remote sessions) — and attempting
// webgpu in that state poisons transformers.js' model cache, so the wasm retry for the
// same model fails too. Probe first, then pick.
async function availableDevices() {
  try {
    if (navigator.gpu && (await navigator.gpu.requestAdapter())) return ['webgpu', 'wasm']
  } catch { /* fall through to wasm */ }
  return ['wasm']
}

async function getPipe(onStatus) {
  if (pipePromise) return pipePromise
  pipePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const devices = await availableDevices()
    let lastErr
    for (const model of CANDIDATES) {
      for (const device of devices) {
        try {
          onStatus?.(`loading ${model} (${device})…`)
          const p = await pipeline('depth-estimation', model, {
            device,
            progress_callback: (d) => {
              if (d.status === 'progress' && d.progress != null)
                onStatus?.(`${model} ${Math.round(d.progress)}%`)
            },
          })
          usedModel = `${model} · ${device}`
          onStatus?.(`ready (${usedModel})`)
          return p
        } catch (e) { lastErr = e }
      }
    }
    pipePromise = null
    throw lastErr || new Error('no depth model could be loaded')
  })()
  return pipePromise
}

/**
 * Estimate depth for an image URL.
 * @returns {Promise<{data:Float32Array,width:number,height:number}>} 0=far, 1=near
 */
export async function estimateDepth(url, onStatus) {
  const pipe = await getPipe(onStatus)
  onStatus?.('estimating depth…')
  const out = await pipe(url)
  const t = out.predicted_depth ?? out.depth
  const width = t.dims?.at(-1) ?? t.width
  const height = t.dims?.at(-2) ?? t.height
  const raw = t.data

  let min = Infinity, max = -Infinity
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i]
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || 1
  const data = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) data[i] = (raw[i] - min) / range

  onStatus?.('depth ready')
  return { data, width, height }
}

/** Float depth -> THREE texture (R32F). flipY handled to match image placement. */
export function depthTexture({ data, width, height }) {
  // flip rows so it matches a flipY=true colour texture
  const flipped = new Float32Array(data.length)
  for (let y = 0; y < height; y++) {
    const s = (height - 1 - y) * width
    flipped.set(data.subarray(s, s + width), y * width)
  }
  const tex = new THREE.DataTexture(flipped, width, height, THREE.RedFormat, THREE.FloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

/** Fallback / manual import: build depth from a greyscale image element. */
export function depthFromImage(img) {
  const cv = document.createElement('canvas')
  cv.width = img.naturalWidth; cv.height = img.naturalHeight
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data: px } = ctx.getImageData(0, 0, cv.width, cv.height)
  const data = new Float32Array(cv.width * cv.height)
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4] / 255
  return { data, width: cv.width, height: cv.height }
}

/** Cheap luminance depth so a layer is usable before the model finishes. */
export function depthFromLuminance(img) {
  const maxW = 512
  const s = Math.min(1, maxW / img.naturalWidth)
  const w = Math.max(2, Math.round(img.naturalWidth * s))
  const h = Math.max(2, Math.round(img.naturalHeight * s))
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const { data: px } = ctx.getImageData(0, 0, w, h)
  const data = new Float32Array(w * h)
  for (let i = 0; i < data.length; i++)
    data[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
  return { data, width: w, height: h }
}
