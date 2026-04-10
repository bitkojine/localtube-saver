import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { extractVideoId } from './src/validation';
import { TaskQueue } from './src/queue';
import { getVideoInfo, downloadVideo, cleanupTempFiles, VideoInfo } from './src/download';
import { transcodeToMp4 } from './src/transcode';
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
import strings from './src/strings';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import { setToolDir, ensureTools, getYtDlpPath, getFfmpegPath } from './src/tools';
import { Server, get as httpGet } from 'http';
import * as os from 'os';
import { Buffer } from 'buffer';

interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: string;
  progress: number;
  error: string | null;
  errorDetails: string | null;
  outputPath: string | null;
  tempPath?: string;
  transfer: {
    url: string;
    token: string;
    qr: string;
    expiresAt: number;
    server: Server;
  } | null;
  transferTimer: NodeJS.Timeout | null;
}


process.on('uncaughtException', (err) => {
  logging.error('Uncaught Exception', err);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-crash', {
      message: err.message,
      stack: err.stack
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logging.error('Unhandled Rejection at:', promise);
  logging.error('Reason:', reason);
});

const queue = new TaskQueue();
const downloads = new Map<string, DownloadItem>();
let mainWindow: BrowserWindow | null = null;
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
    const logError = (msg: string, err?: unknown) => {
      logging.error(msg, err);
      process.stderr.write(`[SMOKE-ERROR] ${msg} ${err ? JSON.stringify(err) : ''}\n`);
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
  } catch (error: unknown) {
    const logError = (msg: string, err?: unknown) => {
      logging.error(msg, err);
      process.stderr.write(`[SMOKE-ERROR] ${msg} ${err ? JSON.stringify(err) : ''}\n`);
    };
    logError('Smoke test failed', error);
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

  const updateData = {
    id: item.id,
    url: item.url,
    title: item.title,
    status: item.status,
    progress: item.progress,
    error: item.error,
    errorDetails: item.errorDetails,
    outputPath: item.outputPath,
    transfer: item.transfer ? {
      url: item.transfer.url,
      qr: item.transfer.qr,
      expiresAt: item.transfer.expiresAt
    } : null
  };

  mainWindow.webContents.send('download-update', updateData);
}

function runPipeline(item: DownloadItem): void {
  queue.add(async () => {
    const videoId = extractVideoId(item.url);
    if (videoId) {
      const cachedPath = getCachedPath(videoId);
      if (cachedPath) {
        logging.info(`using cached video for ${videoId}: ${cachedPath}`);
        item.outputPath = cachedPath;
        item.status = strings.status.readyToSend;
        item.progress = 100;
        item.error = null;
        item.errorDetails = null;
        sendUpdate(item.id);
        return;
      }
    }

    const updateProgress = throttle((progress: number) => {
      item.progress = progress;
      sendUpdate(item.id);
    }, PROGRESS_UPDATE_MIN_MS);

    try {
      await ensureTools();
      const info = await getVideoInfo(item.url);
      item.title = info.title;
      sendUpdate(item.id);

      logging.info(`[Pipeline] Checking disk space for ${info.sizeBytes} bytes`);
      ensureOutputDir();
      const required = info.sizeBytes > 0 ? info.sizeBytes * 2 : 0;
      if (!hasEnoughDiskSpace(OUTPUT_DIR, required)) {
        logging.error(`[Pipeline] Not enough disk space: ${required} required`);
        item.error = strings.errors.notEnoughDisk;
        item.status = strings.status.ready;
        sendUpdate(item.id);
        return;
      }

      logging.info('[Pipeline] Starting download');
      const downloadResult = await downloadVideo(item.url, (percent) => {
        item.status = strings.status.downloading;
        updateProgress(Math.round(percent));
      }, info);

      item.tempPath = downloadResult.tempPath;
      logging.info(`[Pipeline] Downloaded to ${item.tempPath}. Starting transcoding.`);
      item.status = strings.status.transcoding;
      item.progress = 0;
      sendUpdate(item.id);

      const outputPath = ensureUniquePath(buildOutputPath(info.title));
      await transcodeToMp4(item.tempPath, outputPath, (time, duration) => {
        const percent = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
        updateProgress(percent);
      });

      logging.info(`[Pipeline] Transcoding finished: ${outputPath}`);
      item.outputPath = outputPath;
      if (videoId) {
        setCachedPath(videoId, outputPath);
      }
      item.status = strings.status.readyToSend;
      item.progress = 100;
      item.error = null;
      item.errorDetails = null;
      sendUpdate(item.id);
    } catch (error: unknown) {
      logging.error('[Pipeline] Global failure', error);
      
      let errorMsg = strings.errors.downloadFailed;
      const errorTyped = error as { type?: string; message?: string; stderr?: string };
      const errorType = errorTyped.type || errorTyped.message || 'UNKNOWN';

      if (errorType === 'INFO_ERROR' || errorType === 'INFO_PARSE_ERROR') {
        errorMsg = strings.errors.infoError;
      } else if (errorType === 'FILE_TOO_LARGE') {
        errorMsg = strings.errors.fileTooLarge;
      } else if (errorType === 'NETWORK_ERROR') {
        errorMsg = strings.errors.networkError;
      } else if (errorType === 'FORMAT_ERROR') {
        errorMsg = strings.errors.formatError;
      } else if (errorType === 'EXTRACTION_ERROR') {
        errorMsg = strings.errors.extractionError;
      }
      
      if (errorTyped.stderr) {
        logging.error(`[Pipeline] Captured stderr: ${errorTyped.stderr}`);
        if (errorTyped.stderr.includes('Sign in to confirm you’re not a bot')) {
          errorMsg = 'YouTube prašo patvirtinti, kad nesate robotas.';
        } else if (errorTyped.stderr.includes('This video is age-restricted')) {
          errorMsg = 'Vaizdo įrašas turi amžiaus ribojimą.';
        } else if (errorTyped.stderr.includes('Video unavailable')) {
          errorMsg = 'Vaizdo įrašas nepasiekiamas.';
        } else if (errorTyped.stderr.includes('GVS PO Token')) {
          errorMsg = 'YouTube reikalauja papildomo patvirtinimo (PO Token). Bandykite vėliau arba atnaujinkite nustatymus.';
        }
      }

      item.error = errorMsg;
      item.errorDetails = errorTyped.stderr || errorTyped.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      item.status = strings.status.ready;
      sendUpdate(item.id);
    } finally {
      if (item.tempPath) {
        try {
          if (fs.existsSync(item.tempPath)) {
            fs.unlinkSync(item.tempPath);
            logging.info(`[Pipeline] Cleanup: Deleted temp file ${item.tempPath}`);
          }
          item.tempPath = undefined;
        } catch (error) {
          logging.warn(`[Pipeline] Cleanup: Failed to delete temp file ${item.tempPath}`);
        }
      }
    }
  });
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
  logging.info(`Platform: ${process.platform}, Arch: ${process.arch}, OS: ${os.type()} ${os.release()}`);
  logging.info(`UserData path: ${app.getPath('userData')}`);
  logging.info(`Tool path (yt-dlp): ${getYtDlpPath()}`);
  logging.info(`Tool path (ffmpeg): ${getFfmpegPath()}`);

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

ipcMain.on('app-log', (_event, { level, message, err }) => {
  switch (level) {
    case 'info':
      logging.info(message);
      break;
    case 'warn':
      logging.warn(message);
      break;
    case 'error':
      logging.error(message, err);
      break;
    case 'debug':
      logging.debug(message);
      break;
  }
});

ipcMain.handle('download-start', async (_event, url: string) => {
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
    errorDetails: null,
    outputPath: null,
    transfer: null,
    transferTimer: null
  };
  downloads.set(id, item);
  sendUpdate(id);

  runPipeline(item);

  return { id };
});

ipcMain.handle('download-retry', async (_event, id: string) => {
  const item = downloads.get(id);
  if (!item) return;
  item.error = null;
  item.errorDetails = null;
  item.status = strings.status.downloading;
  item.progress = 0;
  sendUpdate(id);
  runPipeline(item);
  return { id };
});

ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('transfer-start', async (_event, id: string) => {
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
    item.errorDetails = null;
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

    return { id, transfer: { url, qr } };
  } catch (error: unknown) {
    const err = error as Error;
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

ipcMain.handle('transfer-start-by-path', async (_event, filePath: string) => {
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
      errorDetails: null,
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
  } catch (error: unknown) {
    const err = error as Error;
    logging.error(`transfer server start failed for ${filePath}: ${err.message}`, err);
    return { error: `Siuntimas nepavyko: ${err.message}` };
  }
});
