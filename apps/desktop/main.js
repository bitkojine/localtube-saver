const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { extractVideoId } = require('./src/validation');
const { TaskQueue } = require('./src/queue');
const { getVideoInfo, downloadVideo, cleanupTempFiles } = require('./src/download');
const { transcodeToMp4 } = require('./src/transcode');
const { buildOutputPath, ensureUniquePath, hasEnoughDiskSpace, ensureOutputDir, getCachedPath, setCachedPath } = require('./src/storage');
const { createTransferServer, closeTransferServer } = require('./src/transfer');
const logging = require('./src/logging');
const { getLocalIp, throttle } = require('./src/util');
const { OUTPUT_DIR, PROGRESS_UPDATE_MIN_MS } = require('./src/config');
const strings = require('./src/strings');
const QRCode = require('qrcode');
const fs = require('fs');
const { setToolDir, ensureTools } = require('./src/tools');

const queue = new TaskQueue();
const downloads = new Map();
let mainWindow;

function sendUpdate(id) {
  if (!mainWindow) return;
  const item = downloads.get(id);
  if (!item) return;

  // Clone to avoid serializing circular or complex objects (like the express server)
  const updateData = {
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
    } : null
  };

  mainWindow.webContents.send('download-update', updateData);
}

function runPipeline(item) {
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
        sendUpdate(item.id);
        return;
      }
    }

    const updateProgress = throttle((progress) => {
      item.progress = progress;
      sendUpdate(item.id);
    }, PROGRESS_UPDATE_MIN_MS);

    try {
      await ensureTools();
      const info = await getVideoInfo(item.url);
      item.title = info.title;
      sendUpdate(item.id);

      ensureOutputDir();
      const required = info.sizeBytes > 0 ? info.sizeBytes * 2 : 0;
      if (!hasEnoughDiskSpace(OUTPUT_DIR, required)) {
        item.error = strings.errors.notEnoughDisk;
        item.status = strings.status.ready;
        sendUpdate(item.id);
        return;
      }

      const downloadResult = await downloadVideo(item.url, (percent) => {
        item.status = strings.status.downloading;
        updateProgress(Math.round(percent));
      }, info);

      item.tempPath = downloadResult.tempPath;
      item.status = strings.status.transcoding;
      item.progress = 0;
      sendUpdate(item.id);

      const outputPath = ensureUniquePath(buildOutputPath(info.title));
      await transcodeToMp4(item.tempPath, outputPath, (time, duration) => {
        const percent = duration > 0 ? Math.min(100, Math.round((time / duration) * 100)) : 0;
        updateProgress(percent);
      });

      try {
        fs.unlinkSync(item.tempPath);
      } catch (error) {
        // ignore
      }

      item.outputPath = outputPath;
      if (videoId) {
        setCachedPath(videoId, outputPath);
      }
      item.status = strings.status.readyToSend;
      item.progress = 100;
      item.error = null;
      sendUpdate(item.id);
    } catch (error) {
      logging.error(`download pipeline error: ${error.message}`, error);
      item.error = strings.errors.downloadFailed;
      item.status = strings.status.ready;
      sendUpdate(item.id);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  setToolDir(path.join(app.getPath('userData'), 'bin'));
  ensureTools()
    .catch((error) => {
      logging.error(`tool setup failed: ${error.message}`, error);
    });

  cleanupTempFiles();
  logging.cleanupOldLogs();
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

  autoUpdater.on('error', (err) => {
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

ipcMain.handle('download-start', async (event, url) => {
  const id = `dl-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (!extractVideoId(url)) {
    return { id, error: strings.errors.invalidUrl };
  }

  const item = {
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

ipcMain.handle('download-retry', async (event, id) => {
  const item = downloads.get(id);
  if (!item) return;
  item.error = null;
  item.status = strings.status.downloading;
  item.progress = 0;
  sendUpdate(id);
  runPipeline(item);
  return { id };
});

ipcMain.handle('transfer-start', async (event, id) => {
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
      // Keep going, but this is a likely cause for "it doesn't work"
      item.error = 'Vietinis tinklas nerastas. Telefonas gali neprisijungti.';
    }
    const url = `http://${ip}:${transfer.port}/transfer?token=${transfer.token}`;
    logging.info(`transfer server listening at ${url}`);
    const qr = await QRCode.toDataURL(url);

    item.error = null; // Clear any previous errors on success
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
      closeTransferServer(item.transfer?.server);
      if (downloads.get(id) === item) {
        item.transfer = null;
        item.status = strings.status.ready;
        sendUpdate(id);
      }
    }, ttl);
    sendUpdate(id);

    return { id, transfer: { url, qr } };
  } catch (error) {
    logging.error(`transfer server start failed: ${error.message}`, error);
    item.error = `Siuntimas nepavyko: ${error.message}`;
    sendUpdate(id);
    return { error: `Siuntimas nepavyko: ${error.message}` };
  }
});

ipcMain.handle('transfer-stop', async (event, id) => {
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
