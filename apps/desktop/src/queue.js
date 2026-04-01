const { MAX_CONCURRENT_DOWNLOADS } = require('./config');

class TaskQueue {
  constructor(concurrency = MAX_CONCURRENT_DOWNLOADS) {
    this.concurrency = concurrency;
    this.queue = [];
    this.activeCount = 0;
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  next() {
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

module.exports = {
  TaskQueue
};
