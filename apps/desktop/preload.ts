import { contextBridge, ipcRenderer } from 'electron';
import type { CrashInfo, DownloadUpdate, LocaltubeAPI } from './src/types';

const api: LocaltubeAPI = {
  startDownload: (url: string) => ipcRenderer.invoke('download-start', url),
  retryDownload: (id: string) => ipcRenderer.invoke('download-retry', id),
  startTransfer: (id: string) => ipcRenderer.invoke('transfer-start', id),
  stopTransfer: (id: string) => ipcRenderer.invoke('transfer-stop', id),
  restartForUpdate: () => ipcRenderer.invoke('update-restart'),
  getVersion: () => ipcRenderer.invoke('app-version'),
  getFiles: () => ipcRenderer.invoke('storage-get-files'),
  deleteFile: (filePath: string) => ipcRenderer.invoke('storage-delete-file', filePath),
  startTransferByPath: (filePath: string) => ipcRenderer.invoke('transfer-start-by-path', filePath),
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, err?: Error | string) => ipcRenderer.send('app-log', { level, message, err: err instanceof Error ? err.message : err }),
  onUpdate: (callback: (data: DownloadUpdate) => void) => ipcRenderer.on('download-update', (_event, data) => callback(data)),
  onUpdateAvailable: (callback: () => void) => ipcRenderer.on('update-available', () => callback()),
  onUpdateProgress: (callback: (percent: number) => void) => ipcRenderer.on('update-progress', (_event, percent) => callback(percent)),
  onUpdateDownloaded: (callback: () => void) => ipcRenderer.on('update-downloaded', () => callback()),
  onCrash: (callback: (err: CrashInfo) => void) => ipcRenderer.on('app-crash', (_event, err) => callback(err as CrashInfo))
};

contextBridge.exposeInMainWorld('localtube', api);
