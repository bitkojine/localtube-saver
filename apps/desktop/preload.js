const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localtube', {
  startDownload: (url) => ipcRenderer.invoke('download-start', url),
  retryDownload: (id) => ipcRenderer.invoke('download-retry', id),
  startTransfer: (id) => ipcRenderer.invoke('transfer-start', id),
  stopTransfer: (id) => ipcRenderer.invoke('transfer-stop', id),
  discoverDevices: () => ipcRenderer.invoke('devices-discover'),
  onUpdate: (callback) => ipcRenderer.on('download-update', (_, data) => callback(data))
});
