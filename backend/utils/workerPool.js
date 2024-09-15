
// utils/workerPool.js
const { Worker } = require('worker_threads');
const os = require('os');

class WorkerPool {
  constructor(workerScript, numWorkers = os.cpus().length) {
    this.workers = [];
    this.taskQueue = [];
    for (let i = 0; i < numWorkers; i++) {
      this.workers.push(new Worker(workerScript));
    }
  }

  runTask(task) {
    return new Promise((resolve, reject) => {
      const availableWorker = this.workers.find(w => !w.busy);
      if (availableWorker) {
        availableWorker.busy = true;
        availableWorker.postMessage(task);
        availableWorker.once('message', (result) => {
          availableWorker.busy = false;
          resolve(result);
        });
        availableWorker.once('error', reject);
      } else {
        this.taskQueue.push({ task, resolve, reject });
      }
    });
  }
}

module.exports = WorkerPool;