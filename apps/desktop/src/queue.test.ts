import test from 'node:test';
import assert from 'node:assert';
import { TaskQueue } from './queue';

test('TaskQueue: starts empty', () => {
  const q = new TaskQueue(2);
  assert.strictEqual(q.size, 0);
  assert.strictEqual(q.active, 0);
});

test('TaskQueue: runs a task immediately when slot available', async () => {
  const q = new TaskQueue(2);
  const result = await q.add(() => 42);
  assert.strictEqual(result, 42);
  assert.strictEqual(q.size, 0);
  assert.strictEqual(q.active, 0);
});

test('TaskQueue: queues tasks when at concurrency limit', async () => {
  const q = new TaskQueue(1);
  let slowResolve: (v: number) => void;
  const slowPromise = q.add(() => new Promise<number>((resolve) => { slowResolve = resolve; }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.strictEqual(q.active, 1);
  assert.strictEqual(q.size, 0);

  const fastPromise = q.add(() => 99);
  assert.strictEqual(q.size, 1);
  assert.strictEqual(q.active, 1);

  slowResolve!(1);
  const slowResult = await slowPromise;
  assert.strictEqual(slowResult, 1);

  const fastResult = await fastPromise;
  assert.strictEqual(fastResult, 99);
  assert.strictEqual(q.active, 0);
  assert.strictEqual(q.size, 0);
});

test('TaskQueue: clear removes queued tasks', () => {
  const q = new TaskQueue(1);
  q.add(() => new Promise(() => {}));
  q.add(() => 42);
  assert.strictEqual(q.size, 1);
  q.clear();
  assert.strictEqual(q.size, 0);
});

test('TaskQueue: rejects when task throws', async () => {
  const q = new TaskQueue(2);
  await assert.rejects(
    q.add(() => { throw new Error('task failed'); }),
    /task failed/
  );
});

test('TaskQueue: respects custom concurrency', async () => {
  const q = new TaskQueue(3);
  assert.strictEqual(q.active, 0);
  const promises = [
    q.add(() => new Promise(() => {})),
    q.add(() => new Promise(() => {})),
    q.add(() => new Promise(() => {})),
  ];
  assert.strictEqual(q.active, 3);
  assert.strictEqual(q.size, 0);
  q.clear();
  promises.forEach(p => p.catch(() => {}));
});

test('TaskQueue: size reports queued count, not active', async () => {
  const q = new TaskQueue(2);
  const promises = [
    q.add(() => new Promise(() => {})),
    q.add(() => new Promise(() => {})),
    q.add(() => 1),
    q.add(() => 2),
  ];
  assert.strictEqual(q.active, 2);
  assert.strictEqual(q.size, 2);
  q.clear();
  promises.forEach(p => p.catch(() => {}));
});
