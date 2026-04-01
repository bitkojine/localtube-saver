const path = require('path');
const os = require('os');

const isWindows = process.platform === 'win32';

const OUTPUT_DIR = isWindows
  ? path.join(process.env.USERPROFILE || os.homedir(), 'Videos', 'LocalTube')
  : path.join(os.homedir(), 'Movies', 'LocalTube');

const LOG_DIR = path.join(__dirname, '..', 'logs');

module.exports = {
  APP_NAME: 'LocalTube Saver',
  YTDLP_CHANNEL: 'nightly',
  YTDLP_NIGHTLY_REPO: 'https://github.com/yt-dlp/yt-dlp-nightly-builds',
  FFMPEG_VERSION: '6.0',
  OUTPUT_DIR,
  LOG_DIR,
  TEMP_DIR: os.tmpdir(),
  MAX_FILENAME_LENGTH: 120,
  MAX_FILE_SIZE_BYTES: 2 * 1024 * 1024 * 1024,
  DOWNLOAD_FORMAT_PRIMARY: 'bv*[height<=720]+ba/best',
  DOWNLOAD_FORMAT_FALLBACK: 'best',
  DOWNLOAD_RETRIES: 2,
  DOWNLOAD_NO_PROGRESS_TIMEOUT_MS: 30_000,
  TRANSCODE_NO_PROGRESS_TIMEOUT_MS: 30_000,
  TRANSFER_NO_DATA_TIMEOUT_MS: 30_000,
  TRANSFER_TOKEN_TTL_MS: 10 * 60_000,
  TRANSFER_BIND_HOST: '0.0.0.0',
  PROGRESS_UPDATE_MIN_MS: 500,
  MAX_CONCURRENT_DOWNLOADS: 2,
  COOKIES_FROM_BROWSER: 'chrome'
};
