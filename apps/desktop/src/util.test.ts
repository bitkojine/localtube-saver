import test from 'node:test';
import assert from 'node:assert';
import { throttle } from './util';

test('throttle: calls immediately on first invocation', () => {
  let count = 0;
  const fn = throttle(() => { count += 1; }, 100);
  fn();
  assert.strictEqual(count, 1);
});

test('throttle: skips calls within interval', () => {
  let count = 0;
  const fn = throttle(() => { count += 1; }, 1000);
  fn();
  fn();
  fn();
  assert.strictEqual(count, 1);
});

test('throttle: calls again after interval', async () => {
  let count = 0;
  const fn = throttle(() => { count += 1; }, 50);
  fn();
  assert.strictEqual(count, 1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  fn();
  assert.strictEqual(count, 2);
});

test('throttle: passes arguments', () => {
  const results: number[] = [];
  const fn = throttle((x: number) => { results.push(x); }, 100);
  fn(1);
  fn(2);
  fn(3);
  assert.deepStrictEqual(results, [1]);
});

test('throttle: last delayed call fires after interval', async () => {
  const results: number[] = [];
  const fn = throttle((x: number) => { results.push(x); }, 50);
  fn(1);
  fn(2);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepStrictEqual(results, [1, 2]);
});
