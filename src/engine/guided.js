// Edge-aware depth refinement (He et al., guided filter).
//
// Monocular depth models run at a small fixed input size, so their output is soft and
// its edges drift away from the real object edges. The guided filter re-snaps the depth
// to the photo's own edges — the single biggest quality win available without a much
// heavier model. O(n), independent of radius.

/** Separable box blur over a Float32Array plane. */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const norm = 1 / (2 * r + 1)

  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

const mul = (a, b) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * b[i]; return o }

/**
 * @param {Float32Array} guide  luminance of the photo, 0..1, w*h
 * @param {Float32Array} input  depth to refine, 0..1, w*h
 * @param {number} radius       px (relative to this resolution)
 * @param {number} eps          edge sensitivity; smaller = sharper, more texture leak
 */
export function guidedFilter(guide, input, w, h, radius = 8, eps = 1e-3) {
  const meanI = boxBlur(guide, w, h, radius)
  const meanP = boxBlur(input, w, h, radius)
  const corrI = boxBlur(mul(guide, guide), w, h, radius)
  const corrIP = boxBlur(mul(guide, input), w, h, radius)

  const a = new Float32Array(w * h)
  const b = new Float32Array(w * h)
  for (let i = 0; i < a.length; i++) {
    const varI = corrI[i] - meanI[i] * meanI[i]
    const covIP = corrIP[i] - meanI[i] * meanP[i]
    a[i] = covIP / (varI + eps)
    b[i] = meanP[i] - a[i] * meanI[i]
  }
  const meanA = boxBlur(a, w, h, radius)
  const meanB = boxBlur(b, w, h, radius)

  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = meanA[i] * guide[i] + meanB[i]
  return out
}

/** Bilinear resample of a single-channel plane. */
export function resamplePlane(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh)
  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * sh) / dh - 0.5
    const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * sw) / dw - 0.5
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1]
      const c = src[y1 * sw + x0], d = src[y1 * sw + x1]
      out[y * dw + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    }
  }
  return out
}

/** Luminance plane from an image element, at a chosen working size. */
export function luminancePlane(img, w, h) {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++)
    out[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255
  return out
}

export function normalise(p) {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < p.length; i++) { if (p[i] < min) min = p[i]; if (p[i] > max) max = p[i] }
  const r = max - min || 1
  const out = new Float32Array(p.length)
  for (let i = 0; i < p.length; i++) out[i] = (p[i] - min) / r
  return out
}
