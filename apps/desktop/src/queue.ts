import { MAX_CONCURRENT_DOWNLOADS } from './config';

type Task<T> = () => Promise<T> | T;

interface QueueItem<T> {
  task: Task<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export class TaskQueue {
  private concurrency: number;
  private queue: QueueItem<unknown>[] = [];
  private activeCount: number = 0;

  constructor(concurrency: number = MAX_CONCURRENT_DOWNLOADS) {
    this.concurrency = concurrency;
  }

  add<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject } as QueueItem<unknown>);
      this.next();
    });
  }

  private next(): void {
    if (this.activeCount >= this.concurrency) {
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.activeCount += 1;
    Promise.resolve()
      .then(item.task)
      .then((result) => item.resolve(result))
      .catch((error) => item.reject(error))
      .finally(() => {
        this.activeCount -= 1;
        this.next();
      });
  }
}
