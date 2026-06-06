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

function getExtractorArgs(): string {
  let args = 'youtube:player-client=mweb,web;player-skip=webpage,configs';
  const tokens: string[] = [];
  if (YOUTUBE_PO_TOKEN) {
    tokens.push(`web.gvs+${YOUTUBE_PO_TOKEN}`);
    tokens.push(`web.player+${YOUTUBE_PO_TOKEN}`);
    tokens.push(`mweb.gvs+${YOUTUBE_PO_TOKEN}`);
    tokens.push(`mweb.player+${YOUTUBE_PO_TOKEN}`);
  }
  if (tokens.length > 0) {
    args += `;po_token=${tokens.join(',')}`;
  }
  if (YOUTUBE_VISITOR_DATA) {
    args += `;visitor_data=${YOUTUBE_VISITOR_DATA}`;
  }
  return args;
}

export function getVideoInfo(url: string): Promise<VideoInfo> {
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
      'node'
    ];
    if (COOKIES_FROM_BROWSER) {
      args.push('--cookies-from-browser', COOKIES_FROM_BROWSER);
    }
    args.push(url);

    logging.info(`[Pipeline] Getting video info for: ${url}`);
    logging.debug(`[Pipeline] Executing: ${ytDlpPath} ${args.join(' ')}`);

    const proc = spawn(ytDlpPath, args);
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      logging.error(`[Pipeline] yt-dlp info timed out after ${INFO_TIMEOUT_MS}ms, killing process`);
      proc.kill('SIGKILL');
    }, INFO_TIMEOUT_MS);

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

function classifyError(stderrText: string): AppErrorType {
  const text = stderrText.toLowerCase();
  if (text.includes('requested format is not available') || text.includes('format not available')) {
    return 'FORMAT_ERROR';
  }
  if (text.includes('unable to download') || text.includes('http error') || text.includes('network')) {
    return 'NETWORK_ERROR';
  }
  return 'EXTRACTION_ERROR';
}

function spawnDownload(url: string, format: string, tempPath: string, onProgress: (percent: number) => void): Promise<void> {
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
      'node',
      '--ffmpeg-location',
      getFfmpegPath()
    ];
    if (COOKIES_FROM_BROWSER) {
      args.push('--cookies-from-browser', COOKIES_FROM_BROWSER);
    }
    args.push(url);

    const proc = spawn(getYtDlpPath(), args);
    logging.debug(`Executing: ${getYtDlpPath()} ${args.join(' ')}`);
    let stderr = '';
    let lastProgressAt = Date.now();
    let lastPercent = 0;

    let killedByWatchdog = false;
    let killedByTotalTimeout = false;

    const noProgressWatchdog = setInterval(() => {
      if (Date.now() - lastProgressAt > DOWNLOAD_NO_PROGRESS_TIMEOUT_MS) {
        killedByWatchdog = true;
        logging.error(`No download progress for ${DOWNLOAD_NO_PROGRESS_TIMEOUT_MS}ms, killing yt-dlp process`);
        proc.kill('SIGKILL');
      }
    }, 1_000);

    const totalTimeout = setTimeout(() => {
      killedByTotalTimeout = true;
      logging.error(`Download total timeout of ${DOWNLOAD_TOTAL_TIMEOUT_MS}ms reached, killing yt-dlp process`);
      proc.kill('SIGKILL');
    }, DOWNLOAD_TOTAL_TIMEOUT_MS);

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
        logging.error(`yt-dlp download timed out after ${DOWNLOAD_TOTAL_TIMEOUT_MS}ms`, timeoutError);
        reject(timeoutError);
        return;
      }

      if (killedByWatchdog) {
        const stallError = new AppError('STALLED', { stderr, tempPath });
        logging.error(`yt-dlp download stalled (no progress for ${DOWNLOAD_NO_PROGRESS_TIMEOUT_MS}ms)`, stallError);
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

export async function downloadVideo(url: string, onProgress: (percent: number) => void, existingInfo?: VideoInfo): Promise<DownloadResult> {
  logging.info(`Starting download for URL: ${url}`);
  const info = existingInfo || await getVideoInfo(url);
  if (info.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new AppError('FILE_TOO_LARGE');
  }

  const safeName = `localtube-${Date.now()}.mp4`;
  const tempPath = path.join(TEMP_DIR, safeName);

  let attempt = 0;
  while (attempt <= DOWNLOAD_RETRIES) {
    try {
      await spawnDownload(url, DOWNLOAD_FORMAT_PRIMARY, tempPath, onProgress);
      return { info, tempPath };
    } catch (error) {
      if (error instanceof AppError && error.type === 'FORMAT_ERROR') {
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
