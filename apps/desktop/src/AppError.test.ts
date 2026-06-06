import test from 'node:test';
import assert from 'node:assert';
import { AppError } from './AppError';

test('AppError: creates with just type', () => {
  const err = new AppError('NETWORK_ERROR');
  assert.strictEqual(err.type, 'NETWORK_ERROR');
  assert.strictEqual(err.message, 'NETWORK_ERROR');
  assert.strictEqual(err.name, 'AppError');
  assert.strictEqual(err.stderr, undefined);
  assert.strictEqual(err.stdout, undefined);
  assert.strictEqual(err.code, undefined);
  assert.strictEqual(err.tempPath, undefined);
});

test('AppError: creates with all options', () => {
  const err = new AppError('FORMAT_ERROR', {
    stderr: 'some error',
    stdout: 'some output',
    code: 1,
    tempPath: '/tmp/file'
  });
  assert.strictEqual(err.type, 'FORMAT_ERROR');
  assert.strictEqual(err.stderr, 'some error');
  assert.strictEqual(err.stdout, 'some output');
  assert.strictEqual(err.code, 1);
  assert.strictEqual(err.tempPath, '/tmp/file');
});

test('AppError: is instance of Error', () => {
  const err = new AppError('TIMEOUT');
  assert.ok(err instanceof Error);
});

test('AppError: handles all error types', () => {
  const types = [
    'INFO_ERROR', 'INFO_PARSE_ERROR', 'FORMAT_ERROR',
    'NETWORK_ERROR', 'EXTRACTION_ERROR', 'TIMEOUT',
    'STALLED', 'FILE_TOO_LARGE', 'DOWNLOAD_FAILED',
    'TRANSCODE_TIMEOUT', 'TRANSCODE_STALLED'
  ] as const;
  for (const t of types) {
    const err = new AppError(t);
    assert.strictEqual(err.type, t);
  }
});
