const fs = require('fs');
const path = require('path');
const https = require('https');
const { YTDLP_NIGHTLY_REPO } = require('./config');
const logging = require('./logging');

let toolDir = null;

function setToolDir(dir) {
  toolDir = dir;
}

function getToolDir() {
  if (!toolDir) {
    throw new Error('TOOL_DIR_NOT_SET');
  }
  return toolDir;
}

function getYtDlpPath() {
  return path.join(getToolDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
}

function getFfmpegPath() {
  return require('ffmpeg-static');
}

function getFfprobePath() {
  const ffprobe = require('ffprobe-static');
  return ffprobe.path || ffprobe;
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const tempPath = `${destination}.download`;

    const fetch = (currentUrl) => {
      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetch(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`DOWNLOAD_HTTP_${res.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(tempPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tempPath, destination);
            resolve();
          });
        });
      }).on('error', reject);
    };

    fetch(url);
  });
}

async function ensureYtDlp() {
  const target = getYtDlpPath();
  const marker = `${target}.version`;
  const today = new Date().toISOString().split('T')[0];

  if (fs.existsSync(target) && fs.existsSync(marker)) {
    const lastChecked = fs.readFileSync(marker, 'utf8').trim();
    if (lastChecked === today) {
      return target;
    }
  }

  fs.mkdirSync(getToolDir(), { recursive: true });

  let assetName = 'yt-dlp';
  if (process.platform === 'darwin') {
    assetName = 'yt-dlp_macos';
  } else if (process.platform === 'win32') {
    assetName = 'yt-dlp.exe';
  } else if (process.platform === 'linux') {
    assetName = 'yt-dlp_linux';
  }

  const url = `${YTDLP_NIGHTLY_REPO}/releases/latest/download/${assetName}`;
  logging.info(`Updating yt-dlp to latest nightly from ${url}`);
  try {
    await downloadFile(url, target);
    fs.writeFileSync(marker, today);
    fs.chmodSync(target, 0o755);
  } catch (error) {
    if (!fs.existsSync(target)) {
      throw error;
    }
    logging.error(`yt-dlp update failed, using existing version: ${error.message}`);
  }
  return target;
}

async function ensureTools() {
  await ensureYtDlp();
  getFfmpegPath();
  getFfprobePath();
}

module.exports = {
  setToolDir,
  getYtDlpPath,
  getFfmpegPath,
  getFfprobePath,
  ensureTools
};
