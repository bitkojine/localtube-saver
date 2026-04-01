const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  DOWNLOAD_FORMAT_PRIMARY,
  DOWNLOAD_FORMAT_FALLBACK,
  DOWNLOAD_RETRIES,
  DOWNLOAD_NO_PROGRESS_TIMEOUT_MS,
  MAX_FILE_SIZE_BYTES,
  TEMP_DIR,
  COOKIES_FROM_BROWSER
} = require('./config');
const logging = require('./logging');
const { getYtDlpPath, getFfmpegPath } = require('./tools');

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const EXTRACTOR_ARGS = 'youtube:player-client=ios,web;po_token=web+Mn7-9G-A7_Y0W2B9O-k5-q8-7-k-p-1-2-3-4-5-6-7-8-9-0';

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (error) {
    return null;
  }
}

function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '--dump-json',
      '--skip-download',
      '--user-agent',
      USER_AGENT,
      '--extractor-args',
      EXTRACTOR_ARGS,
      '--js-runtimes',
      'node',
      url
    ];
    if (COOKIES_FROM_BROWSER) {
      args.push('--cookies-from-browser', COOKIES_FROM_BROWSER);
    }

    const proc = spawn(getYtDlpPath(), args);
    logging.debug(`Executing: ${getYtDlpPath()} ${args.join(' ')}`);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      logging.debug(`yt-dlp info finished with code ${code}`);
      if (code !== 0) {
        logging.error(`yt-dlp info error (code ${code}): ${stderr.trim()}`);
        reject(new Error('INFO_ERROR'));
        return;
      }

      const line = stdout.trim().split('\n').pop();
      const info = parseJsonLine(line);
      if (!info) {
        reject(new Error('INFO_PARSE_ERROR'));
        return;
      }

      const size = Number(info.filesize_approx || info.filesize || 0);
      const audioBitrate = Number(info.abr || info.tbr || 0);
      resolve({
        title: info.title || 'video',
        sizeBytes: Number.isFinite(size) ? size : 0,
        audioBitrate
      });
    });
  });
}

function classifyError(stderrText) {
  const text = stderrText.toLowerCase();
  if (text.includes('requested format is not available') || text.includes('format not available')) {
    return 'FORMAT_ERROR';
  }
  if (text.includes('unable to download') || text.includes('http error') || text.includes('network')) {
    return 'NETWORK_ERROR';
  }
  return 'EXTRACTION_ERROR';
}

function spawnDownload(url, format, tempPath, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-playlist',
      '--newline',
      '--no-part',
      '--format',
      format,
      '--merge-output-format',
      'mp4',
      '--output',
      tempPath,
      '--user-agent',
      USER_AGENT,
      '--extractor-args',
      EXTRACTOR_ARGS,
      '--js-runtimes',
      'node',
      '--ffmpeg-location',
      getFfmpegPath(),
      url
    ];
    if (COOKIES_FROM_BROWSER) {
      args.push('--cookies-from-browser', COOKIES_FROM_BROWSER);
    }

    const proc = spawn(getYtDlpPath(), args);
    logging.debug(`Executing: ${getYtDlpPath()} ${args.join(' ')}`);
    let stderr = '';
    let lastProgressAt = Date.now();
    let lastPercent = 0;
    const timeout = setInterval(() => {
      if (Date.now() - lastProgressAt > DOWNLOAD_NO_PROGRESS_TIMEOUT_MS) {
        proc.kill('SIGKILL');
      }
    }, 1_000);

    proc.stdout.on('data', (data) => {
      const line = data.toString();
      const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
      if (match) {
        const percent = Number(match[1]);
        lastProgressAt = Date.now();
        if (percent !== lastPercent) {
          lastPercent = percent;
          onProgress(Math.max(0, Math.min(100, percent)));
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearInterval(timeout);
      logging.info(`yt-dlp download finished with code ${code}`);
      if (code === 0) {
        resolve();
      } else {
        logging.error(`yt-dlp error: ${stderr.trim()}`);
        reject({
          type: classifyError(stderr),
          stderr
        });
      }
    });
  });
}

async function downloadVideo(url, onProgress, existingInfo) {
  logging.info(`Starting download for URL: ${url}`);
  const info = existingInfo || await getVideoInfo(url);
  if (info.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const safeName = `localtube-${Date.now()}.mp4`;
  const tempPath = path.join(TEMP_DIR, safeName);

  let attempt = 0;
  while (attempt <= DOWNLOAD_RETRIES) {
    try {
      await spawnDownload(url, DOWNLOAD_FORMAT_PRIMARY, tempPath, onProgress);
      return { info, tempPath };
    } catch (error) {
      if (error.type === 'FORMAT_ERROR') {
        try {
          await spawnDownload(url, DOWNLOAD_FORMAT_FALLBACK, tempPath, onProgress);
          return { info, tempPath };
        } catch (fallbackError) {
          attempt += 1;
          if (attempt > DOWNLOAD_RETRIES) {
            throw fallbackError;
          }
        }
      } else {
        attempt += 1;
        if (attempt > DOWNLOAD_RETRIES) {
          throw error;
        }
      }
    }
  }

  throw new Error('DOWNLOAD_FAILED');
}

function cleanupTempFiles() {
  try {
    const entries = fs.readdirSync(TEMP_DIR);
    for (const entry of entries) {
      if (entry.startsWith('localtube-')) {
        const fullPath = path.join(TEMP_DIR, entry);
        try {
          fs.unlinkSync(fullPath);
        } catch (error) {
          // ignore
        }
      }
    }
  } catch (error) {
    // ignore
  }
}

module.exports = {
  getVideoInfo,
  downloadVideo,
  cleanupTempFiles
};
