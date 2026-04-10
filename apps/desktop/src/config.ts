import * as path from 'path';
import * as os from 'os';

const isWindows = process.platform === 'win32';
const isPackagedApp = __dirname.includes('.asar');
const LOG_BASE_DIR = isPackagedApp ? process.resourcesPath : path.join(__dirname, '..');

export const OUTPUT_DIR = isWindows
  ? path.join(process.env.USERPROFILE || os.homedir(), 'Videos', 'LocalTube')
  : path.join(os.homedir(), 'Movies', 'LocalTube');

export const LOG_DIR = path.join(LOG_BASE_DIR, 'logs');

export const APP_NAME = 'LocalTube Saver';
export const YTDLP_CHANNEL = 'nightly';
export const YTDLP_NIGHTLY_REPO = 'https://github.com/yt-dlp/yt-dlp-nightly-builds';
export const FFMPEG_VERSION = '6.0';
export const TEMP_DIR = os.tmpdir();
export const MAX_FILENAME_LENGTH = 120;
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
export const DOWNLOAD_FORMAT_PRIMARY = 'bv*[height<=720]+ba/best';
export const DOWNLOAD_FORMAT_FALLBACK = 'best';
export const DOWNLOAD_RETRIES = 2;
export const DOWNLOAD_NO_PROGRESS_TIMEOUT_MS = 30_000;
export const TRANSCODE_NO_PROGRESS_TIMEOUT_MS = 30_000;
export const TRANSFER_NO_DATA_TIMEOUT_MS = 30_000;
export const TRANSFER_TOKEN_TTL_MS = 10 * 60_000;
export const TRANSFER_BIND_HOST = '0.0.0.0';
export const PROGRESS_UPDATE_MIN_MS = 500;
export const MAX_CONCURRENT_DOWNLOADS = 2;
export const COOKIES_FROM_BROWSER = 'chrome';


export const YOUTUBE_PO_TOKEN = process.env.YOUTUBE_PO_TOKEN || '';
export const YOUTUBE_VISITOR_DATA = process.env.YOUTUBE_VISITOR_DATA || '';
