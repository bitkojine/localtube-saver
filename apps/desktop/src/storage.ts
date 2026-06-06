import * as fs from 'fs';
import * as path from 'path';
import sanitize from 'sanitize-filename';
import { OUTPUT_DIR, MAX_FILENAME_LENGTH } from './config';
import * as logging from './logging';
import type { FileInfo } from './types';

type Cache = Record<string, string>;

export interface FsModule {
  mkdirSync: typeof fs.mkdirSync;
  existsSync: typeof fs.existsSync;
  readFileSync: typeof fs.readFileSync;
  writeFileSync: typeof fs.writeFileSync;
  readdirSync: typeof fs.readdirSync;
  statSync: typeof fs.statSync;
  statfsSync: typeof fs.statfsSync;
  unlinkSync: typeof fs.unlinkSync;
}

const defaultFs: FsModule = {
  mkdirSync: fs.mkdirSync,
  existsSync: fs.existsSync,
  readFileSync: fs.readFileSync,
  writeFileSync: fs.writeFileSync,
  readdirSync: fs.readdirSync,
  statSync: fs.statSync,
  statfsSync: fs.statfsSync,
  unlinkSync: fs.unlinkSync,
};

function getFs(fsModule?: FsModule): FsModule {
  return fsModule || defaultFs;
}

function cacheFilePath(outputDir: string): string {
  return path.join(outputDir, '.cache.json');
}

export function parseCache(raw: Record<string, string>): Cache {
  const cache: Cache = {};
  for (const key of Object.keys(raw)) {
    if (typeof raw[key] === 'string') {
      cache[key] = raw[key];
    }
  }
  return cache;
}

function ensureOutputDirImpl(outputDir: string, fsModule?: FsModule): void {
  getFs(fsModule).mkdirSync(outputDir, { recursive: true });
}

function loadCache(fsModule?: FsModule): Cache {
  const f = getFs(fsModule);
  const filePath = cacheFilePath(OUTPUT_DIR);
  try {
    if (f.existsSync(filePath)) {
      const raw = JSON.parse(f.readFileSync(filePath, 'utf8'));
      const cache = parseCache(raw);
      if (Object.keys(cache).length === 0 && typeof raw !== 'object') {
        logging.debug(`[Storage] Invalid cache format, resetting`);
      }
      return cache;
    }
  } catch (_error) {
    logging.debug(`[Storage] Failed to load cache from ${filePath}`);
  }
  return {};
}

function saveCache(cache: Cache, fsModule?: FsModule): void {
  const f = getFs(fsModule);
  const filePath = cacheFilePath(OUTPUT_DIR);
  try {
    ensureOutputDirImpl(OUTPUT_DIR, fsModule);
    f.writeFileSync(filePath, JSON.stringify(cache, null, 2));
  } catch (_error) {
    logging.debug(`[Storage] Failed to save cache to ${filePath}`);
  }
}

export function getCachedPath(videoId: string, fsModule?: FsModule): string | null {
  const cache = loadCache(fsModule);
  const filePath = cache[videoId];
  if (filePath && getFs(fsModule).existsSync(filePath)) {
    return filePath;
  }
  return null;
}

export function setCachedPath(videoId: string, filePath: string, fsModule?: FsModule): void {
  const cache = loadCache(fsModule);
  cache[videoId] = filePath;
  saveCache(cache, fsModule);
}

export function sanitizeTitle(title: string): string {
  const sanitized = sanitize(title).replace(/\s+/g, ' ').trim();
  const truncated = sanitized.slice(0, MAX_FILENAME_LENGTH);
  return truncated.length > 0 ? truncated : 'video';
}

export function buildOutputPath(title: string, fsModule?: FsModule): string {
  ensureOutputDirImpl(OUTPUT_DIR, fsModule);
  const base = sanitizeTitle(title);
  return path.join(OUTPUT_DIR, `${base}.mp4`);
}

export function ensureUniquePath(filePath: string, fsModule?: FsModule): string {
  const f = getFs(fsModule);
  if (!f.existsSync(filePath)) {
    return filePath;
  }
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let counter = 1;
  while (true) {
    const candidate = path.join(dir, `${base} (${counter})${ext}`);
    if (!f.existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

export function hasEnoughDiskSpace(targetDir: string, requiredBytes: number, fsModule?: FsModule): boolean {
  try {
    const f = getFs(fsModule);
    const stats = f.statfsSync(targetDir);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return free >= requiredBytes;
  } catch (_error) {
    return false;
  }
}

export function getFilesInfo(fsModule?: FsModule): FileInfo[] {
  const f = getFs(fsModule);
  ensureOutputDirImpl(OUTPUT_DIR, fsModule);
  try {
    const files = f.readdirSync(OUTPUT_DIR);
    return files
      .filter((file) => !file.startsWith('.'))
      .map((file) => {
        const filePath = path.join(OUTPUT_DIR, file);
        const stats = f.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtimeMs
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (_error) {
    return [];
  }
}

export function deleteFile(filePath: string, fsModule?: FsModule): boolean {
  const f = getFs(fsModule);
  try {
    if (f.existsSync(filePath) && filePath.startsWith(OUTPUT_DIR)) {
      f.unlinkSync(filePath);
      return true;
    }
  } catch (_error) {
    logging.debug(`[Storage] Failed to delete file: ${filePath}`);
  }
  return false;
}

export function ensureOutputDir(outputDir?: string, fsModule?: FsModule): void {
  ensureOutputDirImpl(outputDir || OUTPUT_DIR, fsModule);
}
