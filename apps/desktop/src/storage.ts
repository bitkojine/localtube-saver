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
  } catch (_error) {
    
  }
  return {};
}

function saveCache(cache: Cache): void {
  try {
    ensureOutputDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (_error) {
    
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
  while (true) {
    const candidate = path.join(dir, `${base} (${counter})${ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

export function hasEnoughDiskSpace(targetDir: string, requiredBytes: number): boolean {
  try {
    
    const stats = fs.statfsSync(targetDir);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return free >= requiredBytes;
  } catch (_error) {
    return false;
  }
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  createdAt: number;
}

export function getFilesInfo(): FileInfo[] {
  ensureOutputDir();
  try {
    const files = fs.readdirSync(OUTPUT_DIR);
    return files
      .filter((file) => !file.startsWith('.')) 
      .map((file) => {
        const filePath = path.join(OUTPUT_DIR, file);
        const stats = fs.statSync(filePath);
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

export function deleteFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath) && filePath.startsWith(OUTPUT_DIR)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (_error) {
    
  }
  return false;
}
