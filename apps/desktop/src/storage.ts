import * as fs from 'fs';
import * as path from 'path';
import sanitize from 'sanitize-filename';
import { OUTPUT_DIR, MAX_FILENAME_LENGTH } from './config';

const CACHE_FILE = path.join(OUTPUT_DIR, '.cache.json');

type Cache = Record<string, string>;

export function ensureOutputDir(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadCache(): Cache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (error) {
    // ignore
  }
  return {};
}

function saveCache(cache: Cache): void {
  try {
    ensureOutputDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    // ignore
  }
}

export function getCachedPath(videoId: string): string | null {
  const cache = loadCache();
  const filePath = cache[videoId];
  if (filePath && fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

export function setCachedPath(videoId: string, filePath: string): void {
  const cache = loadCache();
  cache[videoId] = filePath;
  saveCache(cache);
}

export function sanitizeTitle(title: string): string {
  const sanitized = sanitize(title).replace(/\s+/g, ' ').trim();
  const truncated = sanitized.slice(0, MAX_FILENAME_LENGTH);
  return truncated.length > 0 ? truncated : 'video';
}

export function buildOutputPath(title: string): string {
  ensureOutputDir();
  const base = sanitizeTitle(title);
  return path.join(OUTPUT_DIR, `${base}.mp4`);
}

export function ensureUniquePath(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let counter = 1;
  let candidate = '';
  while (true) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

export function hasEnoughDiskSpace(targetDir: string, requiredBytes: number): boolean {
  try {
    // Note: statfsSync is available in Node 18.15.0+ and 20.0.0+
    const stats = fs.statfsSync(targetDir);
    const free = stats.bavail * stats.bsize;
    return free >= requiredBytes;
  } catch (error) {
    return false;
  }
}
