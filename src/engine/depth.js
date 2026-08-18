import * as THREE from 'three'
import { guidedFilter, resamplePlane, luminancePlane, normalise } from './guided.js'

// Depth Anything V2 in the browser. Weights are cached by the browser after first use.
// Bigger model = notably better structure; the guided filter then snaps the result to
// the photo's real edges, which is what makes depth feel "sharp" rather than blobby.
export const MODELS = {
  small: { id: 'onnx-community/depth-anything-v2-small', label: 'Small · fast', mb: 50 },
  base:  { id: 'onnx-community/depth-anything-v2-base',  label: 'Base · better', mb: 190 },
  large: { id: 'onnx-community/depth-anything-v2-large', label: 'Large · best', mb: 640 },
}
const FALLBACK = 'Xenova/depth-anything-small-hf'

const pipes = new Map()   // modelKey -> Promise<pipeline>
let usedModel = null
export function depthModelName() { return usedModel }

// navigator.gpu can exist while requestAdapter() returns null (virtual displays, remote
// sessions). Attempting webgpu in that state poisons transformers.js' model cache so the
// wasm retry for the same model fails too — so probe for a real adapter first.
let devicesPromise = null
function availableDevices() {
  if (!devicesPromise) devicesPromise = (async () => {
    try { if (navigator.gpu && (await navigator.gpu.requestAdapter())) return ['webgpu', 'wasm'] }
    catch { /* fall through */ }
    return ['wasm']
  })()
  return devicesPromise
}

async function getPipe(modelKey, onStatus) {
  if (pipes.has(modelKey)) return pipes.get(modelKey)
  const p = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    const devices = await availableDevices()
    const ids = [MODELS[modelKey]?.id || MODELS.small.id, FALLBACK]
    let lastErr
    for (const id of ids) {
      for (const device of devices) {
        try {
          onStatus?.(`loading ${id.split('/').pop()} (${device})…`)
          const pipe = await pipeline('depth-estimation', id, {
            device,
            progress_callback: (d) => {
              if (d.status === 'progress' && d.progress != null)
                onStatus?.(`downloading ${id.split('/').pop()} ${Math.round(d.progress)}%`)
            },
          })
          usedModel = `${id.split('/').pop()} · ${device}`
          return pipe
        } catch (e) { lastErr = e }
      }
    }
    pipes.delete(modelKey)
    throw lastErr || new Error('no depth model could be loaded')
  })()
  pipes.set(modelKey, p)
  return p
}

/**
 * Estimate depth and refine it against the photo's edges.
 * @returns {Promise<{data:Float32Array,width:number,height:number}>} 0=far, 1=near
 */
export async function estimateDepth(url, img, opts = {}, onStatus) {
  const { model = 'small', refine = true, radius = 8, eps = 0.0025, maxSize = 1400 } = opts
  const pipe = await getPipe(model, onStatus)
  onStatus?.('estimating depth…')

  const out = await pipe(url)
  const t = out.predicted_depth ?? out.depth
  const dw = t.dims?.at(-1) ?? t.width
  const dh = t.dims?.at(-2) ?? t.height
  let data = normalise(Float32Array.from(t.data))

  if (refine && img) {
    // work at the photo's aspect, capped so the filter stays instant
    const ar = img.naturalWidth / img.naturalHeight
    const w = Math.max(64, Math.min(maxSize, img.naturalWidth))
    const h = Math.max(64, Math.round(w / ar))
    onStatus?.('refining edges…')
    const guide = luminancePlane(img, w, h)
    const up = resamplePlane(data, dw, dh, w, h)
    const r = Math.max(2, Math.round((radius * w) / 1000))
    data = normalise(guidedFilter(guide, up, w, h, r, eps))
    onStatus?.('depth ready')
    return { data, width: w, height: h }
  }

  onStatus?.('depth ready')
  return { data, width: dw, height: dh }
}

/** Float depth -> R32F texture, flipped to match a flipY colour texture. */
export function depthTexture({ data, width, height }) {
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

/** Depth from an imported greyscale image (e.g. real photogrammetry depth). */
export function depthFromImage(img) {
  const w = img.naturalWidth, h = img.naturalHeight
  return { data: luminancePlane(img, w, h), width: w, height: h }
}

/** Instant stand-in so a layer is usable before the model finishes. */
export function depthFromLuminance(img) {
  const s = Math.min(1, 512 / img.naturalWidth)
  const w = Math.max(2, Math.round(img.naturalWidth * s))
  const h = Math.max(2, Math.round(img.naturalHeight * s))
  return { data: luminancePlane(img, w, h), width: w, height: h }
}
