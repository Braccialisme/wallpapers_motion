const { contextBridge, ipcRenderer } = require('electron')

// A tiny, safe surface the web app can feature-detect via window.desktop
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  save: (args) => ipcRenderer.invoke('project:save', args),
  open: () => ipcRenderer.invoke('project:open'),
  exportBegin: (args) => ipcRenderer.invoke('export:begin', args),
  exportFrame: (bytes) => ipcRenderer.invoke('export:frame', bytes),
  exportEnd: (args) => ipcRenderer.invoke('export:end', args || {}),
})
