const { contextBridge, ipcRenderer } = require('electron')

// A tiny, safe surface the web app can feature-detect via window.desktop
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  save: (args) => ipcRenderer.invoke('project:save', args),
  open: () => ipcRenderer.invoke('project:open'),
  exportFrames: (args) => ipcRenderer.invoke('export:frames', args),
})
