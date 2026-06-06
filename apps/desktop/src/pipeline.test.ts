import test from 'node:test';
import assert from 'node:assert';
import { classifyPipelineError, runPipelineTask } from './pipeline';
import type { PipelineDeps } from './pipeline';
import { AppError } from './AppError';

const mockStrings = {
  status: {
    downloading: 'atsisiunčiama',
    transcoding: 'konvertuojama',
    readyToSend: 'paruošta siuntimui',
    ready: 'pasiruošęs'
  },
  errors: {
    downloadFailed: 'nepavyko',
    infoError: 'info klaida',
    fileTooLarge: 'per didelis failas',
    networkError: 'tinklo klaida',
    formatError: 'formato klaida',
    extractionError: 'išgavimo klaida',
    timeoutError: 'laikas baigėsi',
    stalledError: 'užstrigo',
    notEnoughDisk: 'nepakanka vietos'
  }
};

test('classifyPipelineError: maps error types to Lithuanian strings', () => {
  const tests: Array<{ error: Error, expected: string }> = [
    { error: new AppError('INFO_ERROR'), expected: 'info klaida' },
    { error: new AppError('INFO_PARSE_ERROR'), expected: 'info klaida' },
    { error: new AppError('FILE_TOO_LARGE'), expected: 'per didelis failas' },
    { error: new AppError('NETWORK_ERROR'), expected: 'tinklo klaida' },
    { error: new AppError('FORMAT_ERROR'), expected: 'formato klaida' },
    { error: new AppError('EXTRACTION_ERROR'), expected: 'išgavimo klaida' },
    { error: new AppError('TIMEOUT'), expected: 'laikas baigėsi' },
    { error: new AppError('STALLED'), expected: 'užstrigo' },
    { error: new AppError('TRANSCODE_TIMEOUT'), expected: 'laikas baigėsi' },
    { error: new AppError('TRANSCODE_STALLED'), expected: 'užstrigo' },
    { error: new Error('unknown'), expected: 'nepavyko' },
  ];
  for (const { error, expected } of tests) {
    assert.strictEqual(classifyPipelineError(error, mockStrings.errors), expected);
  }
});

test('classifyPipelineError: detects bot message in stderr', () => {
  const error = new AppError('EXTRACTION_ERROR', {
    stderr: 'Sign in to confirm you\u2019re not a bot'
  });
  const msg = classifyPipelineError(error, mockStrings.errors);
  assert.ok(msg.includes('robotas'));
});

test('classifyPipelineError: detects age restriction in stderr', () => {
  const error = new AppError('EXTRACTION_ERROR', {
    stderr: 'This video is age-restricted'
  });
  const msg = classifyPipelineError(error, mockStrings.errors);
  assert.ok(msg.includes('amžiaus'));
});

test('classifyPipelineError: detects PO token message in stderr', () => {
  const error = new AppError('EXTRACTION_ERROR', {
    stderr: 'GVS PO Token'
  });
  const msg = classifyPipelineError(error, mockStrings.errors);
  assert.ok(msg.includes('PO Token'));
});

test('runPipelineTask: uses cache if videoId is cached', async () => {
  const deps: PipelineDeps = {
    extractVideoId: () => 'abc123',
    getCachedPath: () => '/cached/output.mp4',
    setCachedPath: () => {},
    ensureTools: async () => {},
    getVideoInfo: async () => { throw new Error('should not be called'); },
    downloadVideo: async () => { throw new Error('should not be called'); },
    transcodeToMp4: async () => { throw new Error('should not be called'); },
    ensureOutputDir: () => {},
    hasEnoughDiskSpace: () => true,
    buildOutputPath: () => '',
    ensureUniquePath: (p: string) => p,
    throttle: (fn) => fn,
    logging: { info: () => {}, error: () => {}, warn: () => {} },
    strings: mockStrings,
    fs: { existsSync: () => true, unlinkSync: () => {} },
    OUTPUT_DIR: '/tmp',
    PROGRESS_UPDATE_MIN_MS: 0
  };

  type PartialUpdate = Record<string, string | number | null | undefined>;
  const updates: PartialUpdate[] = [];
  await runPipelineTask('https://youtu.be/abc123', 'test-1', (update) => { updates.push(update); }, deps);
  assert.strictEqual(updates.length, 1);
  assert.strictEqual(updates[0].outputPath, '/cached/output.mp4');
  assert.strictEqual(updates[0].status, 'paruošta siuntimui');
});

test('runPipelineTask: handles disk space failure', async () => {
  const deps: PipelineDeps = {
    extractVideoId: () => null,
    getCachedPath: () => null,
    setCachedPath: () => {},
    ensureTools: async () => {},
    getVideoInfo: async () => ({ title: 'test', sizeBytes: 1000, audioBitrate: 128000 }),
    downloadVideo: async () => { throw new Error('should not be called'); },
    transcodeToMp4: async () => { throw new Error('should not be called'); },
    ensureOutputDir: () => {},
    hasEnoughDiskSpace: () => false,
    buildOutputPath: () => '',
    ensureUniquePath: (p: string) => p,
    throttle: (fn) => fn,
    logging: { info: () => {}, error: () => {}, warn: () => {} },
    strings: mockStrings,
    fs: { existsSync: () => true, unlinkSync: () => {} },
    OUTPUT_DIR: '/tmp',
    PROGRESS_UPDATE_MIN_MS: 0
  };

  type PartialUpdate = Record<string, string | number | null | undefined>;
  const updates: PartialUpdate[] = [];
  await runPipelineTask('https://youtu.be/abc123', 'test-2', (update) => { updates.push(update); }, deps);
  const lastUpdate = updates[updates.length - 1];
  assert.strictEqual(lastUpdate.error, 'nepakanka vietos');
});

test('runPipelineTask: runs full pipeline with mocked deps', async () => {
  const deps: PipelineDeps = {
    extractVideoId: () => 'abc123',
    getCachedPath: () => null,
    setCachedPath: () => {},
    ensureTools: async () => {},
    getVideoInfo: async () => ({ title: 'Test Video', sizeBytes: 500_000_000, audioBitrate: 128000 }),
    downloadVideo: async (_url, _onProgress, _info) => ({ info: { title: 'Test Video', sizeBytes: 500_000_000, audioBitrate: 128000 }, tempPath: '/tmp/download.mp4' }),
    transcodeToMp4: async (_input, _output, onProgress) => { onProgress(100, 100); },
    ensureOutputDir: () => {},
    hasEnoughDiskSpace: () => true,
    buildOutputPath: () => '/output/Test Video.mp4',
    ensureUniquePath: (p: string) => p,
    throttle: (fn) => fn,
    logging: { info: () => {}, error: () => {}, warn: () => {} },
    strings: mockStrings,
    fs: { existsSync: () => false, unlinkSync: () => {} },
    OUTPUT_DIR: '/output',
    PROGRESS_UPDATE_MIN_MS: 0
  };

  type PartialUpdate = Record<string, string | number | null | undefined>;
  const updates: PartialUpdate[] = [];
  await runPipelineTask('https://youtu.be/abc123', 'test-3', (update) => { updates.push(update); }, deps);
  const lastUpdate = updates[updates.length - 1];
  assert.strictEqual(lastUpdate.outputPath, '/output/Test Video.mp4');
  assert.strictEqual(lastUpdate.status, 'paruošta siuntimui');
  assert.strictEqual(lastUpdate.error, null);
  assert.strictEqual(lastUpdate.progress, 100);
});
