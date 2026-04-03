import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('localtube', {
  startDownload: (url: string) => ipcRenderer.invoke('download-start', url),
  retryDownload: (id: string) => ipcRenderer.invoke('download-retry', id),
  startTransfer: (id: string) => ipcRenderer.invoke('transfer-start', id),
  stopTransfer: (id: string) => ipcRenderer.invoke('transfer-stop', id),
  restartForUpdate: () => ipcRenderer.invoke('update-restart'),
  discoverDevices: () => ipcRenderer.invoke('devices-discover'),
  getVersion: () => ipcRenderer.invoke('app-version'),
  getFiles: () => ipcRenderer.invoke('storage-get-files'),
  deleteFile: (filePath: string) => ipcRenderer.invoke('storage-delete-file', filePath),
  startTransferByPath: (filePath: string) => ipcRenderer.invoke('transfer-start-by-path', filePath),
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, err?: unknown) => ipcRenderer.send('app-log', { level, message, err }),
  onUpdate: (callback: (data: unknown) => void) => ipcRenderer.on('download-update', (_, data) => callback(data)),
  onUpdateAvailable: (callback: () => void) => ipcRenderer.on('update-available', () => callback()),
  onUpdateProgress: (callback: (percent: number) => void) => ipcRenderer.on('update-progress', (_, percent) => callback(percent)),
  onUpdateDownloaded: (callback: () => void) => ipcRenderer.on('update-downloaded', () => callback()),
  onCrash: (callback: (err: unknown) => void) => ipcRenderer.on('app-crash', (_, err) => callback(err))
});
