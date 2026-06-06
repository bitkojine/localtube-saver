import test from 'node:test';
import assert from 'node:assert';
import { extractVideoId } from './validation';

test('extractVideoId: standard youtube.com/watch?v=ID', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId: youtu.be short link', () => {
  assert.strictEqual(extractVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extractVideoId: returns null for invalid ID length', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=short'), null);
});

test('extractVideoId: returns null for non-YouTube URLs', () => {
  assert.strictEqual(extractVideoId('https://example.com'), null);
});

test('extractVideoId: returns null for garbage input', () => {
  assert.strictEqual(extractVideoId('not a url'), null);
});

test('extractVideoId: returns null for empty string', () => {
  assert.strictEqual(extractVideoId(''), null);
});

test('extractVideoId: returns null when extra params present', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=shared'), null);
});

test('extractVideoId: returns null for youtu.be with extra params', () => {
  assert.strictEqual(extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=abc123'), null);
});

test('extractVideoId: handles m.youtube.com', () => {
  assert.strictEqual(extractVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), null);
});
