import { MAX_CONCURRENT_DOWNLOADS } from './config';

type Task<T> = () => Promise<T> | T;

interface InternalQueueItem {
  run: () => void;
}

export class TaskQueue {
  private concurrency: number;
  private queue: InternalQueueItem[] = [];
  private activeCount: number = 0;

  get size(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }

  constructor(concurrency: number = MAX_CONCURRENT_DOWNLOADS) {
    this.concurrency = concurrency;
  }

  add<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedReject = (reason: Error) => reject(reason);
      this.queue.push({
        run: () => {
          Promise.resolve()
            .then(task)
            .then((result) => resolve(result))
            .catch((error) => wrappedReject(error instanceof Error ? error : new Error(String(error))))
            .finally(() => {
              this.activeCount -= 1;
              this.next();
            });
        }
      });
      this.next();
    });
  }

  clear(): void {
    this.queue = [];
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
    item.run();
  }
}
