const fs = require('fs');
const path = require('path');
const sanitize = require('sanitize-filename');
const { OUTPUT_DIR, MAX_FILENAME_LENGTH } = require('./config');

const CACHE_FILE = path.join(OUTPUT_DIR, '.cache.json');

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (error) {
    // ignore
  }
  return {};
}

function saveCache(cache) {
  try {
    ensureOutputDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    // ignore
  }
}

function getCachedPath(videoId) {
  const cache = loadCache();
  const filePath = cache[videoId];
  if (filePath && fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

function setCachedPath(videoId, filePath) {
  const cache = loadCache();
  cache[videoId] = filePath;
  saveCache(cache);
}

function sanitizeTitle(title) {
  const sanitized = sanitize(title).replace(/\s+/g, ' ').trim();
  const truncated = sanitized.slice(0, MAX_FILENAME_LENGTH);
  return truncated.length > 0 ? truncated : 'video';
}

function buildOutputPath(title) {
  ensureOutputDir();
  const base = sanitizeTitle(title);
  return path.join(OUTPUT_DIR, `${base}.mp4`);
}

function ensureUniquePath(filePath) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let counter = 1;
  let candidate = '';
  do {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

function hasEnoughDiskSpace(targetDir, requiredBytes) {
  try {
    const stats = fs.statfsSync(targetDir);
    const free = stats.bavail * stats.bsize;
    return free >= requiredBytes;
  } catch (error) {
    return false;
  }
}

module.exports = {
  ensureOutputDir,
  sanitizeTitle,
  buildOutputPath,
  ensureUniquePath,
  hasEnoughDiskSpace,
  getCachedPath,
  setCachedPath
};
