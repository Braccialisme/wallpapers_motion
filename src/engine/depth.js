import * as THREE from 'three'
import { guidedFilter, resamplePlane, luminancePlane, normalise, reliefFromShading, lowPass, blur } from './guided.js'

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
async function sceneDepth(url, model, onStatus) {
  const pipe = await getPipe(model, onStatus)
  onStatus?.('estimating scene depth…')
  const out = await pipe(url)
  const t = out.predicted_depth ?? out.depth
  return {
    data: Float32Array.from(t.data),
    width: t.dims?.at(-1) ?? t.width,
    height: t.dims?.at(-2) ?? t.height,
  }
}

/**
 * Build a depth map.
 *
 * source:
 *   'scene'  monocular depth. Right for real space — a cave, an arch, a receding wall.
 *   'relief' height from shading. Right for carvings and anything flat shot head-on,
 *            where scene depth carries no signal and only amplifies noise.
 *   'hybrid' large-scale layout from scene depth, surface detail from shading.
 *
 * There is deliberately no auto mode. A monocular model returns confident smooth depth
 * for a flat frieze and for a real interior alike — measured on our own material the two
 * are only 0.84 vs 0.96 on any separability metric worth trusting, so guessing would
 * quietly pick wrong. The choice is explicit instead.
 */
export async function estimateDepth(url, img, opts = {}, onStatus) {
  const {
    model = 'small', source = 'relief', refine = true, radius = 8, eps = 0.02,
    reliefScale = 26, reliefGain = 1, invert = false, maxSize = 1400,
  } = opts

  const ar = img.naturalWidth / img.naturalHeight
  const w = Math.max(64, Math.min(maxSize, img.naturalWidth))
  const h = Math.max(64, Math.round(w / ar))
  const lum = luminancePlane(img, w, h)

  let data
  let picked = source

  if (source === 'relief') {
    onStatus?.('building relief from shading…')
    data = reliefFromShading(lum, w, h, (reliefScale * w) / 1000, reliefGain)
  } else {
    const scene = await sceneDepth(url, model, onStatus)
    const up0 = resamplePlane(scene.data, scene.width, scene.height, w, h)
    let up = up0

    if (picked === 'hybrid') {
      onStatus?.('combining scene depth with surface relief…')
      const base = normalise(up)
      const large = lowPass(base, w, h, (reliefScale * 2 * w) / 1000)
      const detail = reliefFromShading(lum, w, h, (reliefScale * w) / 1000, reliefGain)
      data = new Float32Array(base.length)
      for (let i = 0; i < data.length; i++) data[i] = large[i] + (detail[i] - 0.5) * 0.7
    } else {
      if (refine) {
        onStatus?.('refining edges…')
        const r = Math.max(2, Math.round((radius * w) / 1000))
        up = guidedFilter(lum, normalise(up), w, h, r, eps)
      }
      data = up
    }
  }

  data = normalise(data)
  // a little smoothing keeps shading noise from reading as surface grain
  data = normalise(blur(data, w, h, Math.max(1, Math.round(w / 900)), 1))
  if (invert) for (let i = 0; i < data.length; i++) data[i] = 1 - data[i]

  onStatus?.(`depth ready (${picked})`)
  return { data, width: w, height: h, source: picked }
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
