import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  DOWNLOAD_FORMAT_PRIMARY,
  DOWNLOAD_FORMAT_FALLBACK,
  DOWNLOAD_RETRIES,
  DOWNLOAD_NO_PROGRESS_TIMEOUT_MS,
  DOWNLOAD_TOTAL_TIMEOUT_MS,
  INFO_TIMEOUT_MS,
  MAX_FILE_SIZE_BYTES,
  TEMP_DIR,
  COOKIES_FROM_BROWSER,
  YOUTUBE_PO_TOKEN,
  YOUTUBE_VISITOR_DATA
} from './config';
import * as logging from './logging';
import { getYtDlpPath, getFfmpegPath } from './tools';
import { AppErrorType, YtDlpInfo } from './types';
import { AppError } from './AppError';

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

export function getExtractorArgs(poToken?: string, visitorData?: string): string {
  let args = 'youtube:player-client=mweb,web;player-skip=webpage,configs';
  const tokens: string[] = [];
  if (poToken) {
    tokens.push(`web.gvs+${poToken}`);
    tokens.push(`web.player+${poToken}`);
    tokens.push(`mweb.gvs+${poToken}`);
    tokens.push(`mweb.player+${poToken}`);
  }
  if (tokens.length > 0) {
    args += `;po_token=${tokens.join(',')}`;
  }
  if (visitorData) {
    args += `;visitor_data=${visitorData}`;
  }
  return args;
}

export function getVideoInfo(url: string, deps?: Pick<DownloadDeps, 'spawnFn' | 'ytDlpPath' | 'poToken' | 'visitorData' | 'cookiesFromBrowser' | 'infoTimeoutMs'>): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const ytDlpPath = deps?.ytDlpPath || getYtDlpPath();
    const spawnFn = deps?.spawnFn || spawn;
    const poToken = deps?.poToken !== undefined ? deps.poToken : YOUTUBE_PO_TOKEN;
    const visitorData = deps?.visitorData !== undefined ? deps.visitorData : YOUTUBE_VISITOR_DATA;
    const cookies = deps?.cookiesFromBrowser !== undefined ? deps.cookiesFromBrowser : COOKIES_FROM_BROWSER;
    const args = [
      '--no-playlist',
      '--dump-json',
      '--skip-download',
      '--user-agent',
      USER_AGENT,
      '--extractor-args',
      getExtractorArgs(poToken, visitorData),
      '--js-runtimes',
      'node'
    ];
    if (cookies) {
      args.push('--cookies-from-browser', cookies);
    }
    args.push(url);

    logging.info(`[Pipeline] Getting video info for: ${url}`);
    logging.debug(`[Pipeline] Executing: ${ytDlpPath} ${args.join(' ')}`);

    const proc = spawnFn(ytDlpPath, args);
    let stdout = '';
    let stderr = '';

    const infoTimeout = deps?.infoTimeoutMs !== undefined ? deps.infoTimeoutMs : INFO_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      logging.error(`[Pipeline] yt-dlp info timed out after ${infoTimeout}ms, killing process`);
      proc.kill('SIGKILL');
    }, infoTimeout);

    proc.stdout.on('data', (data) => (stdout += data.toString()));
    proc.stderr.on('data', (data) => (stderr += data.toString()));

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const infoError = new AppError('INFO_ERROR', { stderr, code: code ?? undefined });
        logging.error(`[Pipeline] yt-dlp info failed (code ${code})`, infoError);
        reject(infoError);
        return;
      }

      try {
        const lastLine = stdout.trim().split('\n').pop();
        if (!lastLine) throw new Error('EMPTY_OUTPUT');
        const parsed = JSON.parse(lastLine);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('INVALID_JSON_STRUCTURE');
        }
        const info = parsed as YtDlpInfo;

        const title = typeof info.title === 'string' && info.title.length > 0 ? info.title : 'video';
        const filesize = typeof info.filesize === 'number' ? info.filesize : 0;
        const filesizeApprox = typeof info.filesize_approx === 'number' ? info.filesize_approx : 0;
        const abr = typeof info.abr === 'number' ? info.abr : 0;
        const tbr = typeof info.tbr === 'number' ? info.tbr : 0;

        const size = Number(filesizeApprox || filesize || 0);
        const audioBitrate = Number(abr || tbr || 0);

        logging.info(`[Pipeline] Video info retrieved: "${title}" (${size} bytes)`);

        resolve({
          title,
          sizeBytes: Number.isFinite(size) ? size : 0,
          audioBitrate
        });
      } catch (_err) {
        const parseError = new AppError('INFO_PARSE_ERROR', { stderr, stdout });
        logging.error(`[Pipeline] Failed to parse yt-dlp JSON output`, parseError);
        reject(parseError);
      }
    });
  });
}

export function classifyError(stderrText: string): AppErrorType {
  const text = stderrText.toLowerCase();
  if (text.includes('requested format is not available') || text.includes('format not available')) {
    return 'FORMAT_ERROR';
  }
  if (text.includes('unable to download') || text.includes('http error') || text.includes('network')) {
    return 'NETWORK_ERROR';
  }
  return 'EXTRACTION_ERROR';
}

export interface DownloadDeps {
  spawnFn?: typeof spawn;
  ytDlpPath?: string;
  ffmpegPath?: string;
  poToken?: string;
  visitorData?: string;
  cookiesFromBrowser?: string;
  formatPrimary?: string;
  formatFallback?: string;
  retries?: number;
  infoTimeoutMs?: number;
  noProgressTimeoutMs?: number;
  totalTimeoutMs?: number;
  maxFileSizeBytes?: number;
  tempDir?: string;
}

function spawnDownload(url: string, format: string, tempPath: string, onProgress: (percent: number) => void, deps?: DownloadDeps): Promise<void> {
  return new Promise((resolve, reject) => {
    const ytDlpPath = deps?.ytDlpPath || getYtDlpPath();
    const ffmpegPath = deps?.ffmpegPath || getFfmpegPath();
    const spawnFn = deps?.spawnFn || spawn;
    const poToken = deps?.poToken !== undefined ? deps.poToken : YOUTUBE_PO_TOKEN;
    const visitorData = deps?.visitorData !== undefined ? deps.visitorData : YOUTUBE_VISITOR_DATA;
    const cookies = deps?.cookiesFromBrowser !== undefined ? deps.cookiesFromBrowser : COOKIES_FROM_BROWSER;

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
      getExtractorArgs(poToken, visitorData),
      '--js-runtimes',
      'node',
      '--ffmpeg-location',
      ffmpegPath
    ];
    if (cookies) {
      args.push('--cookies-from-browser', cookies);
    }
    args.push(url);

    const proc = spawnFn(ytDlpPath, args);
    logging.debug(`Executing: ${getYtDlpPath()} ${args.join(' ')}`);
    let stderr = '';
    let lastProgressAt = Date.now();
    let lastPercent = 0;

    let killedByWatchdog = false;
    let killedByTotalTimeout = false;

    const noProgressTimeout = deps?.noProgressTimeoutMs !== undefined ? deps.noProgressTimeoutMs : DOWNLOAD_NO_PROGRESS_TIMEOUT_MS;
    const totalTimeoutMs = deps?.totalTimeoutMs !== undefined ? deps.totalTimeoutMs : DOWNLOAD_TOTAL_TIMEOUT_MS;

    const noProgressWatchdog = setInterval(() => {
      if (Date.now() - lastProgressAt > noProgressTimeout) {
        killedByWatchdog = true;
        logging.error(`No download progress for ${noProgressTimeout}ms, killing yt-dlp process`);
        proc.kill('SIGKILL');
      }
    }, 1_000);

    const totalTimeout = setTimeout(() => {
      killedByTotalTimeout = true;
      logging.error(`Download total timeout of ${totalTimeoutMs}ms reached, killing yt-dlp process`);
      proc.kill('SIGKILL');
    }, totalTimeoutMs);

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
      clearInterval(noProgressWatchdog);
      clearTimeout(totalTimeout);

      if (killedByTotalTimeout) {
        const timeoutError = new AppError('TIMEOUT', { stderr, tempPath });
        logging.error(`yt-dlp download timed out after ${totalTimeoutMs}ms`, timeoutError);
        reject(timeoutError);
        return;
      }

      if (killedByWatchdog) {
        const stallError = new AppError('STALLED', { stderr, tempPath });
        logging.error(`yt-dlp download stalled (no progress for ${noProgressTimeout}ms)`, stallError);
        reject(stallError);
        return;
      }

      logging.info(`yt-dlp download finished with code ${code}`);
      if (code === 0) {
        resolve();
      } else {
        const downloadError = new AppError(classifyError(stderr), { stderr });
        logging.error(`yt-dlp error: ${stderr.trim()}`, downloadError);
        reject(downloadError);
      }
    });
  });
}

export async function downloadVideo(url: string, onProgress: (percent: number) => void, existingInfo?: VideoInfo, deps?: DownloadDeps): Promise<DownloadResult> {
  logging.info(`Starting download for URL: ${url}`);
  const formatPrimary = deps?.formatPrimary || DOWNLOAD_FORMAT_PRIMARY;
  const formatFallback = deps?.formatFallback || DOWNLOAD_FORMAT_FALLBACK;
  const retries = deps?.retries !== undefined ? deps.retries : DOWNLOAD_RETRIES;
  const maxFileSize = deps?.maxFileSizeBytes !== undefined ? deps.maxFileSizeBytes : MAX_FILE_SIZE_BYTES;
  const tempDir = deps?.tempDir || TEMP_DIR;

  const info = existingInfo || await getVideoInfo(url, deps);
  if (info.sizeBytes > maxFileSize) {
    throw new AppError('FILE_TOO_LARGE');
  }

  const safeName = `localtube-${Date.now()}.mp4`;
  const tempPath = path.join(tempDir, safeName);

  let attempt = 0;
  while (attempt <= retries) {
    try {
      await spawnDownload(url, formatPrimary, tempPath, onProgress, deps);
      return { info, tempPath };
    } catch (error) {
      if (error instanceof AppError && error.type === 'FORMAT_ERROR') {
        try {
          await spawnDownload(url, formatFallback, tempPath, onProgress, deps);
          return { info, tempPath };
        } catch (fallbackError) {
          attempt += 1;
          if (attempt > retries) {
            throw fallbackError;
          }
        }
      } else {
        attempt += 1;
        if (attempt > retries) {
          throw error;
        }
      }
    }
  }

  throw new AppError('DOWNLOAD_FAILED');
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
          logging.debug(`[Cleanup] Failed to delete temp file: ${fullPath}`);
        }
      }
    }
  } catch (_error) {
    logging.debug(`[Cleanup] Failed to read TEMP_DIR: ${TEMP_DIR}`);
  }
}
