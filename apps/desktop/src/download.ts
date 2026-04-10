import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  DOWNLOAD_FORMAT_PRIMARY,
  DOWNLOAD_FORMAT_FALLBACK,
  DOWNLOAD_RETRIES,
  DOWNLOAD_NO_PROGRESS_TIMEOUT_MS,
  MAX_FILE_SIZE_BYTES,
  TEMP_DIR,
  COOKIES_FROM_BROWSER,
  YOUTUBE_PO_TOKEN,
  YOUTUBE_VISITOR_DATA
} from './config';
import * as logging from './logging';
import { getYtDlpPath, getFfmpegPath } from './tools';

let cookieExtractionFailed = false;

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface VideoInfo {
  title: string;
  sizeBytes: number;
  audioBitrate: number;
}

export interface DownloadResult {
  info: VideoInfo;
  tempPath: string;
}

function getExtractorArgs(): string {
  const escape = (s: string) => s.replace(/;/g, '\\;').replace(/=/g, '\\=');
  let args = 'youtube:player-client=ios,mweb,web;player-skip=configs';
  if (YOUTUBE_PO_TOKEN) {
    args += `;po_token=${escape(YOUTUBE_PO_TOKEN)}`;
  }
  if (YOUTUBE_VISITOR_DATA) {
    args += `;visitor_data=${escape(YOUTUBE_VISITOR_DATA)}`;
  }
  return args;
}

function getJsRuntimesArg(): string {
  const p = process.platform === 'win32' ? process.execPath.replace(/\\/g, '/') : process.execPath;
  return `node:${p},node`;
}

export function getVideoInfo(url: string, useCookies = true): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const ytDlpPath = getYtDlpPath();
    const args = [
      '--no-playlist',
      '--dump-json',
      '--skip-download',
      '--user-agent',
      USER_AGENT,
      '--extractor-args',
      getExtractorArgs(),
      '--js-runtimes',
      getJsRuntimesArg()
    ];
    if (useCookies && COOKIES_FROM_BROWSER && !cookieExtractionFailed) {
      args.push('--cookies-from-browser', COOKIES_FROM_BROWSER);
    }
    args.push(url);

    logging.info(`[Pipeline] Getting video info for: ${url} (useCookies: ${useCookies})`);
    logging.debug(`[Pipeline] Executing: ${ytDlpPath} ${args.join(' ')}`);

    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    const proc = spawn(ytDlpPath, args, { env, windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data.toString()));
    proc.stderr.on('data', (data) => (stderr += data.toString()));

    proc.on('error', (err) => {
      logging.error(`[Pipeline] yt-dlp info spawn error: ${err.message}`, err);
      reject({ type: 'INFO_ERROR', message: err.message, stderr: `Spawn error: ${err.message}` });
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errorType = classifyError(stderr);
        if (useCookies && errorType === 'COOKIE_ERROR' && !cookieExtractionFailed) {
          cookieExtractionFailed = true;
          logging.warn(`[Pipeline] Cookie extraction failed, retrying without cookies: ${url}`);
          getVideoInfo(url, false).then(resolve).catch(reject);
          return;
        }

        logging.error(`[Pipeline] yt-dlp info failed (code ${code})`, { stderr });
        reject({ type: errorType, code, stderr });
        return;
      }

      try {
        const lastLine = stdout.trim().split('\n').pop();
        if (!lastLine) throw new Error('EMPTY_OUTPUT');
        const info = JSON.parse(lastLine);
        
        const size = Number(info.filesize_approx || info.filesize || 0);
        const audioBitrate = Number(info.abr || info.tbr || 0);

        logging.info(`[Pipeline] Video info retrieved: "${info.title}" (${size} bytes)`);

        resolve({
          title: info.title || 'video',
          sizeBytes: Number.isFinite(size) ? size : 0,
          audioBitrate
        });
      } catch (_err) {
        logging.error(`[Pipeline] Failed to parse yt-dlp JSON output`, { stdout, stderr });
        reject({ type: 'INFO_PARSE_ERROR', stderr, stdout });
      }
    });
  });
}

function classifyError(stderrText: string): string {
  const text = stderrText.toLowerCase();
  if ((text.includes('could not copy') && text.includes('cookie database')) ||
      text.includes('failed to decrypt') ||
      text.includes('dpapi')) {
    return 'COOKIE_ERROR';
  }
  if (text.includes('requested format is not available') || text.includes('format not available')) {
    return 'FORMAT_ERROR';
  }
  if (text.includes('unable to download') || text.includes('http error') || text.includes('network')) {
    return 'NETWORK_ERROR';
  }
  return 'EXTRACTION_ERROR';
}

function spawnDownload(url: string, format: string, tempPath: string, onProgress: (percent: number) => void, useCookies = true): Promise<void> {
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
      getExtractorArgs(),
      '--js-runtimes',
      getJsRuntimesArg(),
      '--ffmpeg-location',
      getFfmpegPath()
    ];
    if (useCookies && COOKIES_FROM_BROWSER && !cookieExtractionFailed) {
      args.push('--cookies-from-browser', COOKIES_FROM_BROWSER);
    }
    args.push(url);

    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    const proc = spawn(getYtDlpPath(), args, { env, windowsHide: true });
    logging.debug(`Executing: ${getYtDlpPath()} ${args.join(' ')} (useCookies: ${useCookies})`);
    let stderr = '';
    let lastProgressAt = Date.now();
    let lastPercent = 0;

    proc.on('error', (err) => {
      logging.error(`[Pipeline] yt-dlp download spawn error: ${err.message}`, err);
      reject({ type: 'NETWORK_ERROR', message: err.message, stderr: `Spawn error: ${err.message}` });
    });

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

export async function downloadVideo(url: string, onProgress: (percent: number) => void, existingInfo?: VideoInfo): Promise<DownloadResult> {
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
      await spawnDownload(url, DOWNLOAD_FORMAT_PRIMARY, tempPath, onProgress, !cookieExtractionFailed);
      return { info, tempPath };
    } catch (error: unknown) {
      const err = error as { type?: string };
      if (err.type === 'COOKIE_ERROR' && !cookieExtractionFailed) {
        cookieExtractionFailed = true;
        logging.warn(`[Pipeline] Cookie extraction failed during download, retrying without cookies: ${url}`);
        continue;
      }

      if (err.type === 'FORMAT_ERROR') {
        try {
          await spawnDownload(url, DOWNLOAD_FORMAT_FALLBACK, tempPath, onProgress, !cookieExtractionFailed);
          return { info, tempPath };
        } catch (fallbackError: unknown) {
          const fallbackErr = fallbackError as { type?: string };
          if (fallbackErr.type === 'COOKIE_ERROR' && !cookieExtractionFailed) {
            cookieExtractionFailed = true;
            logging.warn(`[Pipeline] Cookie extraction failed during fallback download, retrying without cookies: ${url}`);
            continue;
          }
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

export function cleanupTempFiles(): void {
  try {
    const entries = fs.readdirSync(TEMP_DIR);
    for (const entry of entries) {
      if (entry.startsWith('localtube-')) {
        const fullPath = path.join(TEMP_DIR, entry);
        try {
          fs.unlinkSync(fullPath);
        } catch (_error) {
          
        }
      }
    }
  } catch (_error) {
    
  }
}
