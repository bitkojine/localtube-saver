import test from 'node:test';
import assert from 'node:assert';
import { parseFfprobeOutput, getAudioArgs } from './transcode';

test('parseFfprobeOutput: parses valid ffprobe JSON with all fields', () => {
  const stdout = JSON.stringify({
    streams: [
      { codec_type: 'audio', bit_rate: '192000' }
    ],
    format: { duration: '123.456' }
  });
  const result = parseFfprobeOutput(stdout);
  assert.strictEqual(result.duration, 123.456);
  assert.strictEqual(result.audioBitrate, 192000);
});

test('parseFfprobeOutput: returns zero values when no audio stream', () => {
  const stdout = JSON.stringify({
    streams: [
      { codec_type: 'video', bit_rate: '1000000' }
    ],
    format: { duration: '60.0' }
  });
  const result = parseFfprobeOutput(stdout);
  assert.strictEqual(result.duration, 60);
  assert.strictEqual(result.audioBitrate, 0);
});

test('parseFfprobeOutput: returns zero duration when format missing', () => {
  const stdout = JSON.stringify({
    streams: [{ codec_type: 'audio', bit_rate: '128000' }]
  });
  const result = parseFfprobeOutput(stdout);
  assert.strictEqual(result.duration, 0);
  assert.strictEqual(result.audioBitrate, 128000);
});

test('parseFfprobeOutput: throws on invalid JSON', () => {
  assert.throws(() => parseFfprobeOutput('not json'), /PROBE_PARSE_FAILED/);
});

test('parseFfprobeOutput: throws on null', () => {
  assert.throws(() => parseFfprobeOutput('null'), /PROBE_PARSE_FAILED/);
});

test('parseFfprobeOutput: does not throw on array (typeof [] is object)', () => {
  const result = parseFfprobeOutput('[]');
  assert.strictEqual(result.duration, 0);
  assert.strictEqual(result.audioBitrate, 0);
});

test('getAudioArgs: returns copy args for high bitrate', () => {
  const args = getAudioArgs(160000);
  assert.deepStrictEqual(args, ['-c:a', 'copy']);
});

test('getAudioArgs: returns copy args for above 160k', () => {
  const args = getAudioArgs(320000);
  assert.deepStrictEqual(args, ['-c:a', 'copy']);
});

test('getAudioArgs: returns transcode args for below 160k', () => {
  const args = getAudioArgs(128000);
  assert.deepStrictEqual(args, ['-c:a', 'aac', '-b:a', '256k']);
});

test('getAudioArgs: returns transcode args for zero bitrate', () => {
  const args = getAudioArgs(0);
  assert.deepStrictEqual(args, ['-c:a', 'aac', '-b:a', '256k']);
});
