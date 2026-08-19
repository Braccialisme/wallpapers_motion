// Electron main process. Wraps the same web app in a native desktop window and provides
// real native Save/Open dialogs (no browser sandbox, no middle-click autoscroll).
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs/promises')
const path = require('path')

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

// export mp4 with the local ffmpeg if it is on PATH (renderer streams PNG frames here)
ipcMain.handle('export:frames', async (_e, { name, fps, frames }) => {
  const os = require('os'); const { spawn } = require('child_process')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shimmerlab-'))
  for (let i = 0; i < frames.length; i++)
    await fs.writeFile(path.join(dir, 'f_' + String(i).padStart(6, '0') + '.png'), Buffer.from(frames[i]))
  const r = await dialog.showSaveDialog({ defaultPath: (name || 'wall') + '.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] })
  if (r.canceled) return null
  await new Promise((res, rej) => {
    const pr = spawn('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(dir, 'f_%06d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', r.filePath], { stdio: 'ignore' })
    pr.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))))
    pr.on('error', rej)
  })
  await fs.rm(dir, { recursive: true, force: true })
  return r.filePath
})
