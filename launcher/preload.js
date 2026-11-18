const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghost', {
  init: () => ipcRenderer.invoke('init'),
  play: (data) => ipcRenderer.invoke('play', data),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  onLog: (cb) => ipcRenderer.on('log', (_e, m) => cb(m)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onError: (cb) => ipcRenderer.on('error', (_e, m) => cb(m)),
});
