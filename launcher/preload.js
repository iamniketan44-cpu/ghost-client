const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghost', {
  init: () => ipcRenderer.invoke('init'),
  play: (data) => ipcRenderer.invoke('play', data),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  msLogout: () => ipcRenderer.invoke('ms-logout'),
  capeList: () => ipcRenderer.invoke('cape-list'),
  capeSet: (id) => ipcRenderer.invoke('cape-set', id),
  onAccount: (cb) => ipcRenderer.on('account', (_e, n) => cb(n)),
  listMods: () => ipcRenderer.invoke('list-mods'),
  addMods: () => ipcRenderer.invoke('add-mods'),
  removeMod: (name) => ipcRenderer.invoke('remove-mod', name),
  mrSearch: (q) => ipcRenderer.invoke('mr-search', q),
  mrInstall: (id) => ipcRenderer.invoke('mr-install', id),
  onLog: (cb) => ipcRenderer.on('log', (_e, m) => cb(m)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onError: (cb) => ipcRenderer.on('error', (_e, m) => cb(m)),
});
