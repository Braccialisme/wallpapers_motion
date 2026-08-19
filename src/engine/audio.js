// Live audio analysis for audio-reactive effects. Reads the mic (or any input) through
// meyda, exposes a smoothed { level, low, mid, high } that the render loop copies onto
// engine.audio every frame. Shaders read it as uAudio / uAudioLow / uAudioMid / uAudioHigh.
import Meyda from 'meyda'

export const audioState = { on: false, level: 0, low: 0, mid: 0, high: 0 }

let ctx = null
let analyzer = null
let stream = null

// exponential smoothing so the wall pulses rather than jitters
const smooth = (prev, next, k) => prev + (next - prev) * k

function bandAverage(spec, a, b) {
  let s = 0
  for (let i = a; i < b; i++) s += spec[i] || 0
  return s / Math.max(1, b - a)
}

export async function startAudio() {
  if (audioState.on) return true
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    const source = ctx.createMediaStreamSource(stream)
    analyzer = Meyda.createMeydaAnalyzer({
      audioContext: ctx,
      source,
      bufferSize: 512,
      featureExtractors: ['rms', 'amplitudeSpectrum'],
      callback: (f) => {
        const spec = f.amplitudeSpectrum || []
        const n = spec.length || 1
        // normalise: amplitudeSpectrum is unbounded-ish; scale + clamp to 0..1
        const norm = (v) => Math.min(1, v * 6)
        const level = Math.min(1, (f.rms || 0) * 3)
        const low = norm(bandAverage(spec, 0, Math.floor(n * 0.12)))
        const mid = norm(bandAverage(spec, Math.floor(n * 0.12), Math.floor(n * 0.45)))
        const high = norm(bandAverage(spec, Math.floor(n * 0.45), n))
        audioState.level = smooth(audioState.level, level, 0.35)
        audioState.low = smooth(audioState.low, low, 0.4)
        audioState.mid = smooth(audioState.mid, mid, 0.4)
        audioState.high = smooth(audioState.high, high, 0.5)
      },
    })
    analyzer.start()
    audioState.on = true
    return true
  } catch (e) {
    console.warn('[audio] mic denied or unavailable:', e?.message || e)
    stopAudio()
    return false
  }
}

export function stopAudio() {
  try { analyzer?.stop() } catch {}
  try { stream?.getTracks().forEach((t) => t.stop()) } catch {}
  try { ctx?.close() } catch {}
  analyzer = null; stream = null; ctx = null
  audioState.on = false
  audioState.level = audioState.low = audioState.mid = audioState.high = 0
}
