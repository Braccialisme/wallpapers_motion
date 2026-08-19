import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

// ---------------------------------------------------------------------------
// Export server.
// The browser renders each frame at FULL resolution offscreen and POSTs the PNG
// here. Node writes it straight to disk, then ffmpeg (already on PATH) encodes.
// Avoids ffmpeg.wasm and browser memory limits entirely.
// ---------------------------------------------------------------------------
// Where finished mp4s land. Override with:  SHIMMER_OUT=D:/renders npm run dev
const OUT_DIR = process.env.SHIMMER_OUT
  ? path.resolve(process.env.SHIMMER_OUT)
  : path.resolve('exports')

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function json(res, code, obj) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(obj))
}

function exportServer() {
  let session = null // { dir, count, fps, name }

  return {
    name: 'shimmerlab-export',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const route = req.url.split('?')[0]

          // dev-only: let the browser drop an image on disk so depth output can be
          // inspected directly. This middleware exists only in the dev server.
          if (route === '/api/debug/save') {
            const name = new URL(req.url, 'http://x').searchParams.get('name') || 'debug'
            const buf = await readBody(req)
            const dir = path.resolve('dev-assets')
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, `${name}.png`)
            fs.writeFileSync(file, buf)
            return json(res, 200, { ok: true, file })
          }

          if (route === '/api/export/start') {
            const { name = 'shimmer', fps = 24 } = JSON.parse((await readBody(req)).toString() || '{}')
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shimmerlab-'))
            session = { dir, count: 0, fps, name }
            return json(res, 200, { ok: true, dir })
          }

          if (route === '/api/export/frame') {
            if (!session) return json(res, 400, { error: 'no session' })
            const buf = await readBody(req)
            const i = String(session.count).padStart(6, '0')
            fs.writeFileSync(path.join(session.dir, `f_${i}.png`), buf)
            session.count++
            return json(res, 200, { ok: true, n: session.count })
          }

          if (route === '/api/export/finish') {
            if (!session) return json(res, 400, { error: 'no session' })
            const { dir, fps, name, count } = session
            fs.mkdirSync(OUT_DIR, { recursive: true })
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const out = path.join(OUT_DIR, `${name}_${stamp}.mp4`)
            const args = [
              '-y', '-framerate', String(fps),
              '-i', path.join(dir, 'f_%06d.png'),
              '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
              '-crf', '16', '-preset', 'slow',
              '-movflags', '+faststart', out,
            ]
            const code = await new Promise((resolve) => {
              const p = spawn('ffmpeg', args, { stdio: 'ignore' })
              p.on('close', resolve)
              p.on('error', () => resolve(-1))
            })
            try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
            const done = session
            session = null
            if (code !== 0) return json(res, 500, { error: 'ffmpeg failed', code })
            return json(res, 200, { ok: true, file: out, frames: done.count ?? count })
          }

          return json(res, 404, { error: 'unknown route' })
        } catch (err) {
          return json(res, 500, { error: String(err) })
        }
      })
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/, local dev from /
  base: process.env.GITHUB_PAGES ? '/wallpapers_motion/' : '/',
  plugins: [react(), exportServer()],
  server: {
    port: 5175,
    // required for WebGPU / cross-origin isolated model loading
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
})
