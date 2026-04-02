const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localtube', {
  startDownload: (url) => ipcRenderer.invoke('download-start', url),
  retryDownload: (id) => ipcRenderer.invoke('download-retry', id),
  startTransfer: (id) => ipcRenderer.invoke('transfer-start', id),
  stopTransfer: (id) => ipcRenderer.invoke('transfer-stop', id),
  restartForUpdate: () => ipcRenderer.invoke('update-restart'),
  discoverDevices: () => ipcRenderer.invoke('devices-discover'),
  onUpdate: (callback) => ipcRenderer.on('download-update', (_, data) => callback(data)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', () => callback()),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, percent) => callback(percent)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', () => callback())
});
