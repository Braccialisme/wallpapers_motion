// Electron main process. Wraps the same web app in a native desktop window and provides
// real native Save/Open dialogs (no browser sandbox, no middle-click autoscroll).
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

const isDev = !!process.env.ELECTRON_DEV

function createWindow() {
  const win = new BrowserWindow({
    width: 1680,
    height: 1000,
    backgroundColor: '#0a0a0b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setMenuBarVisibility(false)
  if (isDev) win.loadURL('http://localhost:5175')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ---- native file IO exposed to the renderer via preload ----
ipcMain.handle('project:save', async (_e, { name, data, pathHint }) => {
  let filePath = pathHint
  if (!filePath) {
    const r = await dialog.showSaveDialog({
      defaultPath: (name || 'wall') + '.shimmer.json',
      filters: [{ name: 'ShimmerLab project', extensions: ['json'] }],
    })
    if (r.canceled || !r.filePath) return null
    filePath = r.filePath
  }
  await fs.writeFile(filePath, data, 'utf8')
  return filePath
})

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog({
    filters: [{ name: 'ShimmerLab project', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths[0]) return null
  const p = r.filePaths[0]
  return { path: p, data: await fs.readFile(p, 'utf8') }
})

// mp4 export — the SAVE LOCATION is chosen up front, then frames stream to a temp dir
// and are encoded there with the local ffmpeg.
let exp = null
ipcMain.handle('export:begin', async (_e, { name, fps }) => {
  const r = await dialog.showSaveDialog({
    defaultPath: (name || 'wall') + '.mp4',
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
  })
  if (r.canceled || !r.filePath) return false
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shimmerlab-'))
  exp = { dir, out: r.filePath, fps: fps || 24, count: 0 }
  return true
})
ipcMain.handle('export:frame', async (_e, bytes) => {
  if (!exp) return false
  await fs.writeFile(path.join(exp.dir, 'f_' + String(exp.count).padStart(6, '0') + '.png'), Buffer.from(bytes))
  exp.count++
  return true
})
ipcMain.handle('export:end', async (_e, { abort } = {}) => {
  if (!exp) return null
  const { dir, out, fps } = exp
  exp = null
  if (abort) { await fs.rm(dir, { recursive: true, force: true }); return null }
  await new Promise((res, rej) => {
    const pr = spawn('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f_%06d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', out], { stdio: 'ignore' })
    pr.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))))
    pr.on('error', rej)
  })
  await fs.rm(dir, { recursive: true, force: true })
  return out
})
