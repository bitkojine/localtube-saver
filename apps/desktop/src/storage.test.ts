import test from 'node:test';
import assert from 'node:assert';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { parseCache, sanitizeTitle, hasEnoughDiskSpace, buildOutputPath, ensureUniquePath } from './storage';
import type { FsModule } from './storage';

test('parseCache: filters out non-string values', () => {
  const raw = { valid: 'path/to/file', invalid: null, number: 42 };
  const result = parseCache(raw as Record<string, string>);
  assert.deepStrictEqual(result, { valid: 'path/to/file' });
});

test('parseCache: handles empty object', () => {
  assert.deepStrictEqual(parseCache({}), {});
});

test('sanitizeTitle: removes illegal characters', () => {
  const result = sanitizeTitle('file/name:*?bad');
  assert.ok(!result.includes('/'));
  assert.ok(!result.includes(':'));
  assert.ok(!result.includes('*'));
  assert.ok(!result.includes('?'));
});

test('sanitizeTitle: trims whitespace', () => {
  assert.strictEqual(sanitizeTitle('  hello  '), 'hello');
});

test('sanitizeTitle: returns "video" for empty result', () => {
  assert.strictEqual(sanitizeTitle(''), 'video');
});

test('sanitizeTitle: truncates long titles', () => {
  const long = 'a'.repeat(200);
  const result = sanitizeTitle(long);
  assert.ok(result.length <= 120);
});

test('sanitizeTitle: preserves normal titles', () => {
  assert.strictEqual(sanitizeTitle('My Cool Video'), 'My Cool Video');
});

test('hasEnoughDiskSpace: returns true when statfsSync succeeds and enough space', () => {
  const mockFs: FsModule = {
    statfsSync: () => ({ bavail: BigInt(1000), bsize: BigInt(4096) }) as ReturnType<typeof import('fs').statfsSync>,
    mkdirSync: () => {},
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    unlinkSync: () => {}
  };
  assert.strictEqual(hasEnoughDiskSpace('/tmp', 4_000_000, mockFs), true);
});

test('hasEnoughDiskSpace: returns false when not enough space', () => {
  const mockFs: FsModule = {
    statfsSync: () => ({ bavail: BigInt(1), bsize: BigInt(4096) }) as ReturnType<typeof import('fs').statfsSync>,
    mkdirSync: () => {},
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    unlinkSync: () => {}
  };
  assert.strictEqual(hasEnoughDiskSpace('/tmp', 100_000, mockFs), false);
});

test('hasEnoughDiskSpace: returns true when statfsSync is not available', () => {
  const mockFs: FsModule = {
    statfsSync: undefined,
    mkdirSync: () => {},
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    unlinkSync: () => {}
  };
  assert.strictEqual(hasEnoughDiskSpace('/tmp', 1, mockFs), true);
});

test('hasEnoughDiskSpace: returns true when statfsSync throws', () => {
  const mockFs: FsModule = {
    statfsSync: () => { throw new Error('ENOSYS'); },
    mkdirSync: () => {},
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    unlinkSync: () => {}
  };
  assert.strictEqual(hasEnoughDiskSpace('/tmp', 1, mockFs), true);
});

test('ensureUniquePath: returns original path if not taken', () => {
  const mockFs: FsModule = {
    existsSync: () => false,
    mkdirSync: () => {},
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    statfsSync: undefined,
    unlinkSync: () => {}
  };
  const result = ensureUniquePath('/videos/test.mp4', mockFs);
  assert.strictEqual(result, '/videos/test.mp4');
});

test('ensureUniquePath: appends counter when path exists', () => {
  let callCount = 0;
  const mockFs: FsModule = {
    existsSync: () => { callCount += 1; return callCount <= 1; },
    mkdirSync: () => {},
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    statfsSync: undefined,
    unlinkSync: () => {}
  };
  const result = ensureUniquePath('/videos/test.mp4', mockFs);
  assert.strictEqual(result, '/videos/test (1).mp4');
});

test('buildOutputPath: creates path with sanitized title', () => {
  const calledDirs: string[] = [];
  const mockFs: FsModule = {
    mkdirSync: (dir: string) => { calledDirs.push(dir); },
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => {},
    readdirSync: () => [],
    statSync: () => ({}) as ReturnType<typeof import('fs').statSync>,
    statfsSync: undefined,
    unlinkSync: () => {}
  };
  const result = buildOutputPath('My Video Title', mockFs);
  assert.ok(result.endsWith('/My Video Title.mp4'));
  assert.ok(calledDirs.length > 0);
});
