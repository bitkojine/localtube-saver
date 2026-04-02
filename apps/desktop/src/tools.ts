import { pipeline } from 'stream/promises';
import { createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync, renameSync, unlinkSync } from 'fs';
import * as path from 'path';
import * as https from 'https';
import { YTDLP_NIGHTLY_REPO } from './config';
import * as logging from './logging';

let toolDir: string | null = null;

export function setToolDir(dir: string): void {
  toolDir = dir;
}

function getToolDir(): string {
  if (!toolDir) {
    throw new Error('TOOL_DIR_NOT_SET');
  }
  return toolDir;
}

export function getYtDlpPath(): string {
  return path.join(getToolDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
}

export function getFfmpegPath(): string {
  
  return require('ffmpeg-static');
}

export function getFfprobePath(): string {
  
  const ffprobe = require('ffprobe-static');
  return ffprobe.path || ffprobe;
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const tempPath = `${destination}.download`;

  const fetch = (currentUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      https.get(currentUrl, async (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            await fetch(res.headers.location);
            resolve();
          } catch (e) {
            reject(e);
          }
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`DOWNLOAD_HTTP_${res.statusCode}`));
          return;
        }

        const file = createWriteStream(tempPath);
        try {
          await pipeline(res, file);
          renameSync(tempPath, destination);
          resolve();
        } catch (err) {
          try { unlinkSync(tempPath); } catch (_ignore) {  }
          reject(err);
        }
      }).on('error', reject);
    });
  };

  await fetch(url);
}

export async function ensureYtDlp(): Promise<string> {
  const target = getYtDlpPath();
  const marker = `${target}.version`;
  const today = new Date().toISOString().split('T')[0];

  if (existsSync(target) && existsSync(marker)) {
    const lastChecked = readFileSync(marker, 'utf8').trim();
    if (lastChecked === today) {
      return target;
    }
  }

  mkdirSync(getToolDir(), { recursive: true });

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
    writeFileSync(marker, today);
    chmodSync(target, 0o755);
  } catch (error: any) {
    if (!existsSync(target)) {
      throw error;
    }
    logging.error(`yt-dlp update failed, using existing version: ${error.message}`);
  }
  return target;
}

export async function ensureTools(): Promise<void> {
  await ensureYtDlp();
  getFfmpegPath();
  getFfprobePath();
}
