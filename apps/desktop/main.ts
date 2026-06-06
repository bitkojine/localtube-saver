import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { extractVideoId } from './src/validation';
import { TaskQueue } from './src/queue';
import { getVideoInfo, downloadVideo, cleanupTempFiles, VideoInfo, DownloadDeps } from './src/download';
import { transcodeToMp4 } from './src/transcode';
import { runPipelineTask, PipelineDeps } from './src/pipeline';
import {
  buildOutputPath,
  ensureUniquePath,
  hasEnoughDiskSpace,
  ensureOutputDir,
  getCachedPath,
  setCachedPath,
  getFilesInfo,
  deleteFile
} from './src/storage';
import { createTransferServer, closeTransferServer } from './src/transfer';
import * as logging from './src/logging';
import { getLocalIp, throttle } from './src/util';
import { OUTPUT_DIR, PROGRESS_UPDATE_MIN_MS } from './src/config';
import { AppLogPayload, AppErrorType, CrashInfo, DownloadStartResult, DownloadUpdate, TransferInfo, TransferStartResult } from './src/types';
import { AppError } from './src/AppError';
import strings from './src/strings';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import { setToolDir, ensureTools } from './src/tools';
import { Server, get as httpGet } from 'http';
import * as os from 'os';
import { Buffer } from 'buffer';

interface TransferState extends TransferInfo {
  token: string;
  server: Server;
}

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: string;
  progress: number;
  error: string | null;
  outputPath: string | null;
  tempPath?: string;
  transfer: TransferState | null;
  transferTimer: NodeJS.Timeout | null;
}


process.on('uncaughtException', (err) => {
  logging.error('Uncaught Exception', err);
  if (mainWindow && !mainWindow.isDestroyed()) {
    const crashInfo: CrashInfo = {
      message: err.message,
      stack: err.stack
    };
    mainWindow.webContents.send('app-crash', crashInfo);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const promiseStr = `Unhandled Rejection at: ${promise}`;
  logging.error(promiseStr);
  const reasonStr = `Reason: ${reason}`;
  logging.error(reasonStr);
});

const queue = new TaskQueue();
const downloads = new Map<string, DownloadItem>();
let mainWindow: BrowserWindow | null = null;

export function clearDownloads(): void {
  downloads.clear();
}

export function clearQueue(): void {
  queue.clear();
}
const isSmokeTest = process.argv.includes('--smoke-test');
const SMOKE_TEST_REQUEST_TIMEOUT_MS = 15_000;

function readSmokeResponse(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SMOKE_REQUEST_TIMEOUT'));
    }, SMOKE_TEST_REQUEST_TIMEOUT_MS);

    const request = httpGet(url, (response) => {
      if ((response.statusCode || 500) >= 400) {
        clearTimeout(timeout);
        reject(new Error(`SMOKE_HTTP_${response.statusCode || 500}`));
        response.resume();
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      response.on('end', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
      response.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    request.on('error', (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
    request.setTimeout(SMOKE_TEST_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('SMOKE_REQUEST_TIMEOUT'));
    });
  });
}

async function runSmokeTest(): Promise<void> {
  const tempFilePath = path.join(os.tmpdir(), `localtube-smoke-${process.pid}.mp4`);
  let server: Server | null = null;

  try {
    logging.cleanupOldLogs();
    const logInfo = (msg: string) => {
      logging.info(msg);
      process.stdout.write(`[SMOKE-INFO] ${msg}\n`);
    };
    const logError = (msg: string, err?: Error | string) => {
      logging.error(msg, err || null);
      process.stderr.write(`[SMOKE-ERROR] ${msg} ${err ? String(err) : ''}\n`);
    };

    logInfo('Smoke test starting');
    fs.writeFileSync(tempFilePath, Buffer.from('localtube smoke test'));
    logInfo(`Smoke test temp file created at ${tempFilePath}`);
    const transfer = await createTransferServer(tempFilePath, '127.0.0.1');
    server = transfer.server;
    logInfo(`Smoke test server listening on port ${transfer.port}`);
    const url = `http://127.0.0.1:${transfer.port}/transfer?token=${transfer.token}&download=1`;
    logInfo(`Smoke test requesting ${url}`);
    const bytes = await readSmokeResponse(url);
    logInfo(`Smoke test received ${bytes.length} bytes`);
    if (bytes.length === 0) {
      throw new Error('SMOKE_EMPTY_RESPONSE');
    }
    logInfo(`Smoke test succeeded with ${bytes.length} bytes`);
    closeTransferServer(server);
    fs.unlinkSync(tempFilePath);
    app.exit(0);
    } catch (error) {
    const logError = (msg: string, err?: Error) => {
      logging.error(msg, err);
      process.stderr.write(`[SMOKE-ERROR] ${msg} ${err ? String(err) : ''}\n`);
    };
    logError('Smoke test failed', error instanceof Error ? error : new Error(String(error)));
    if (server) {
      closeTransferServer(server);
    }
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    app.exit(1);
  }
}

function sendUpdate(id: string): void {
  if (!mainWindow) return;
  const item = downloads.get(id);
  if (!item) return;

  const updateData: DownloadUpdate = {
    id: item.id,
    url: item.url,
    title: item.title,
    status: item.status,
    progress: item.progress,
    error: item.error,
    outputPath: item.outputPath,
    transfer: item.transfer ? {
      url: item.transfer.url,
      qr: item.transfer.qr,
      expiresAt: item.transfer.expiresAt
    } : null,
    refreshStorage: item.status === strings.status.ready || item.status === strings.status.readyToSend
  };

  mainWindow.webContents.send('download-update', updateData);
}

function runPipeline(item: DownloadItem): void {
  const pipelineDeps: PipelineDeps = {
    extractVideoId,
    getCachedPath,
    setCachedPath,
    ensureTools,
    getVideoInfo,
    downloadVideo,
    transcodeToMp4,
    ensureOutputDir,
    hasEnoughDiskSpace,
    buildOutputPath,
    ensureUniquePath,
    throttle,
    logging,
    strings,
    fs: { existsSync: fs.existsSync, unlinkSync: fs.unlinkSync },
    OUTPUT_DIR,
    PROGRESS_UPDATE_MIN_MS
  };

  queue.add(() => runPipelineTask(item.url, item.id, (update) => {
    if (update.title !== undefined) item.title = update.title;
    if (update.status !== undefined) item.status = update.status;
    if (update.progress !== undefined) item.progress = update.progress;
    if (update.error !== undefined) item.error = update.error;
    if (update.outputPath !== undefined) item.outputPath = update.outputPath;
    if (update.tempPath !== undefined) item.tempPath = update.tempPath;
    sendUpdate(item.id);
  }, pipelineDeps));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
  if (isSmokeTest) {
    void runSmokeTest();
    return;
  }

  setToolDir(path.join(app.getPath('userData'), 'bin'));
  ensureTools()
    .catch((error: Error) => {
      logging.error(`tool setup failed: ${error.message}`, error);
    });

  cleanupTempFiles();
  logging.cleanupOldLogs();
  
  logging.info('App starting...');
  logging.info(`Platform: ${process.platform}, Arch: ${process.arch}`);
  logging.info(`UserData path: ${app.getPath('userData')}`);

  createWindow();

  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
  });

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', progressObj.percent);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err: Error) => {
    logging.error('Update error:', err);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('app-log', (_event, payload: AppLogPayload) => {
  switch (payload.level) {
    case 'info':
      logging.info(payload.message);
      break;
    case 'warn':
      logging.warn(payload.message);
      break;
    case 'error':
      logging.error(payload.message, payload.err ?? null);
      break;
    case 'debug':
      logging.debug(payload.message);
      break;
  }
});

ipcMain.handle('download-start', async (_event, url: string): Promise<DownloadStartResult> => {
  const id = `dl-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (!extractVideoId(url)) {
    return { id, error: strings.errors.invalidUrl };
  }

  const item: DownloadItem = {
    id,
    url,
    title: '',
    status: strings.status.downloading,
    progress: 0,
    error: null,
    outputPath: null,
    transfer: null,
    transferTimer: null
  };
  downloads.set(id, item);
  sendUpdate(id);

  runPipeline(item);

  return { id };
});

ipcMain.handle('download-retry', async (_event, id: string): Promise<Pick<DownloadStartResult, 'id'> | undefined> => {
  const item = downloads.get(id);
  if (!item) return;
  item.error = null;
  item.status = strings.status.downloading;
  item.progress = 0;
  sendUpdate(id);
  runPipeline(item);
  return { id };
});

ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('transfer-start', async (_event, id: string): Promise<TransferStartResult> => {
  const item = downloads.get(id);
  if (!item) {
    logging.error(`transfer-start: item ${id} not found`);
    return { error: 'Prekė nerasta' };
  }
  if (!item.outputPath) {
    logging.error(`transfer-start: item ${id} has no outputPath`);
    return { error: strings.errors.downloadFailed };
  }
  if (!fs.existsSync(item.outputPath)) {
    logging.error(`transfer-start: file not found at ${item.outputPath}`);
    return { error: 'Failas nerastas diske' };
  }

  try {
    logging.info(`starting transfer server for ${item.outputPath}`);
    const transfer = await createTransferServer(item.outputPath);
    const ip = getLocalIp();
    if (ip === '127.0.0.1') {
      logging.warn('transfer-start: getLocalIp returned 127.0.0.1. iPhone might not be able to connect.');
      
      item.error = 'Vietinis tinklas nerastas. Telefonas gali neprisijungti.';
    }
    const url = `http://${ip}:${transfer.port}/transfer?token=${transfer.token}`;
    logging.info(`transfer server listening at ${url}`);
    const qr = await QRCode.toDataURL(url);

    item.error = null; 
    item.transfer = {
      url,
      token: transfer.token,
      qr,
      expiresAt: transfer.expiresAt,
      server: transfer.server
    };
    item.status = strings.status.openOnPhone;
    if (item.transferTimer) {
      clearTimeout(item.transferTimer);
    }
    const ttl = Math.max(0, transfer.expiresAt - Date.now());
    item.transferTimer = setTimeout(() => {
      closeTransferServer(item.transfer?.server || null);
      if (downloads.get(id) === item) {
        item.transfer = null;
        item.status = strings.status.ready;
        sendUpdate(id);
      }
    }, ttl);
    sendUpdate(id);

    return { id, transfer: { url, qr, expiresAt: transfer.expiresAt } };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logging.error(`transfer server start failed: ${err.message}`, err);
    item.error = `Siuntimas nepavyko: ${err.message}`;
    sendUpdate(id);
    return { error: `Siuntimas nepavyko: ${err.message}` };
  }
});

ipcMain.handle('transfer-stop', async (_event, id: string) => {
  const item = downloads.get(id);
  if (!item || !item.transfer) {
    return;
  }
  closeTransferServer(item.transfer.server);
  item.transfer = null;
  if (item.transferTimer) {
    clearTimeout(item.transferTimer);
    item.transferTimer = null;
  }
  item.status = strings.status.ready;
  sendUpdate(id);
});

ipcMain.handle('update-restart', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('storage-get-files', () => {
  return getFilesInfo();
});

ipcMain.handle('storage-delete-file', (_event, filePath: string) => {
  return deleteFile(filePath);
});

ipcMain.handle('transfer-start-by-path', async (_event, filePath: string): Promise<TransferStartResult> => {
  logging.info(`transfer-start-by-path requested for: ${filePath}`);
  const id = `storage-transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (!fs.existsSync(filePath)) {
    logging.error(`transfer-start-by-path: file not found at ${filePath}`);
    return { error: 'Failas nerastas diske' };
  }

  try {
    logging.info(`starting transfer server for ${filePath}`);
    const transfer = await createTransferServer(filePath);
    const ip = getLocalIp();
    if (ip === '127.0.0.1') {
      logging.warn('transfer-start-by-path: getLocalIp returned 127.0.0.1. iPhone might not be able to connect.');
    }
    const url = `http://${ip}:${transfer.port}/transfer?token=${transfer.token}`;
    logging.info(`transfer server listening at ${url}`);
    const qr = await QRCode.toDataURL(url);

    const item: DownloadItem = {
      id,
      url: '',
      title: path.basename(filePath),
      status: strings.status.openOnPhone,
      progress: 100,
      error: null,
      outputPath: filePath,
      transfer: {
        url,
        token: transfer.token,
        qr,
        expiresAt: transfer.expiresAt,
        server: transfer.server
      },
      transferTimer: null
    };

    const ttl = Math.max(0, transfer.expiresAt - Date.now());
    item.transferTimer = setTimeout(() => {
      closeTransferServer(item.transfer?.server || null);
      if (downloads.get(id) === item) {
        downloads.delete(id);
      }
    }, ttl);

    downloads.set(id, item);

    logging.info(`transfer-start-by-path successful for ${filePath}. ID: ${id}. Expires at ${new Date(transfer.expiresAt).toISOString()}`);
    return { id, transfer: { url, qr, expiresAt: transfer.expiresAt } };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logging.error(`transfer server start failed for ${filePath}: ${err.message}`, err);
    return { error: `Siuntimas nepavyko: ${err.message}` };
  }
});
