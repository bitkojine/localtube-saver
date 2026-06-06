import { pipeline } from 'stream/promises';
import { createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync, renameSync, unlinkSync } from 'fs';
import * as path from 'path';
import * as https from 'https';
import { YTDLP_NIGHTLY_REPO } from './config';
import * as logging from './logging';

export interface ToolsDeps {
  httpsGet?: typeof https.get;
  fs?: {
    createWriteStream: typeof createWriteStream;
    renameSync: typeof renameSync;
    unlinkSync: typeof unlinkSync;
    existsSync: typeof existsSync;
    readFileSync: typeof readFileSync;
    writeFileSync: typeof writeFileSync;
    chmodSync: typeof chmodSync;
    mkdirSync: typeof mkdirSync;
  };
  ytdlpRepo?: string;
}

const defaultFs = { createWriteStream, mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync, renameSync, unlinkSync };

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

async function downloadFile(url: string, destination: string, deps?: ToolsDeps): Promise<void> {
  const tempPath = `${destination}.download`;
  const f = deps?.fs || defaultFs;
  const httpGet = deps?.httpsGet || https.get;

  const fetch = (currentUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      httpGet(currentUrl, async (res) => {
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

        const file = f.createWriteStream(tempPath);
        try {
          await pipeline(res, file);
          f.renameSync(tempPath, destination);
          resolve();
        } catch (err) {
          try { f.unlinkSync(tempPath); } catch (_ignore) {
            logging.debug(`[Tools] Failed to clean up temp file: ${tempPath}`);
          }
          reject(err);
        }
      }).on('error', reject);
    });
  };

  await fetch(url);
}

export async function ensureYtDlp(deps?: ToolsDeps): Promise<string> {
  const target = getYtDlpPath();
  const marker = `${target}.version`;
  const today = new Date().toISOString().split('T')[0];
  const f = deps?.fs || defaultFs;
  const repo = deps?.ytdlpRepo || YTDLP_NIGHTLY_REPO;

  if (f.existsSync(target) && f.existsSync(marker)) {
    const lastChecked = f.readFileSync(marker, 'utf8').trim();
    if (lastChecked === today) {
      return target;
    }
  }

  f.mkdirSync(getToolDir(), { recursive: true });

  let assetName = 'yt-dlp';
  if (process.platform === 'darwin') {
    assetName = 'yt-dlp_macos';
  } else if (process.platform === 'win32') {
    assetName = 'yt-dlp.exe';
  } else if (process.platform === 'linux') {
    assetName = 'yt-dlp_linux';
  }

  const url = `${repo}/releases/latest/download/${assetName}`;
  logging.info(`Updating yt-dlp to latest nightly from ${url}`);
  try {
    await downloadFile(url, target, deps);
    f.writeFileSync(marker, today);
    f.chmodSync(target, 0o755);
    } catch (error) {
      if (!f.existsSync(target)) {
        throw error;
      }
      const err = error instanceof Error ? error : new Error(String(error));
      logging.error(`yt-dlp update failed, using existing version: ${err.message}`);
    }
  return target;
}

export async function ensureTools(deps?: ToolsDeps): Promise<void> {
  await ensureYtDlp(deps);
  getFfmpegPath();
  getFfprobePath();
}
