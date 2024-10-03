const fs = require('fs').promises;
const path = require('path');
const printerManager = require('./printerManager');
const logger = require('../utils/logger');
const config = require('../utils/config');
const EventEmitter = require('events');


class PrintQueue extends EventEmitter {
  constructor(mainWindow) {
    super(); 
    this.mainWindow = mainWindow;
    this.queue = [];
    this.isPrinting = false;
    this.tempDir = path.join(config.tempDir, 'pdfs');
  }

  async addJob(job) {
    if (!job.printerName) {
      const printerStatus = await this.getPrinterStatus();
      job.printerName = printerStatus.defaultPrinter || 'Unknown Printer';
    }
    this.queue.push(job);
    this.sortPrintQueue();
    logger.info(`Added job ${job.jobId} to the print queue`, this.mainWindow);
    logger.info(`Adding job with printer: ${job.printerName}`);
    this.sendQueueUpdate();
    if (!this.isPrinting) {
      await this.processPrintQueue();
    }
  }

  async cancelJob(jobId) {
    const index = this.queue.findIndex(job => job.jobId === jobId);
    if (index !== -1) {
      const [canceledJob] = this.queue.splice(index, 1);
      await this.cleanupJobFiles(canceledJob);
      logger.info(`Print job ${jobId} canceled`, this.mainWindow);

    } else {
      logger.warn(`Print job ${jobId} not found in queue`, this.mainWindow);
    }
  }

  async processPrintQueue() {
    if (this.isPrinting || this.queue.length === 0) return;
    this.isPrinting = true;
    logger.info('Started processing print queue', this.mainWindow);
    await this.batchPrintJobs();
    this.isPrinting = false;
    logger.info('Finished processing print queue', this.mainWindow);
    if (this.queue.length > 0) await this.processPrintQueue();
  }

  sortPrintQueue() {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    this.queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  async batchPrintJobs() {
    const batchSize = 5;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, batchSize);
      await Promise.all(batch.map(job => this.processPrintJob(job)));
    }
  }

    async processPrintJob(job) {
    try {
      this.emit('jobStarted', job.jobId);
      const pdfPath = await this.savePdfToFile(job);
      const printResult = await printerManager.startPrintJob(pdfPath, job.printerName, job.settings);
      const status = printResult ? 'completed' : 'failed';
      this.emit('jobFinished', job.jobId, status);
      logger.info(`Print job ${job.jobId} ${status}`, this.mainWindow);
      await this.cleanupJobFiles(job);
      this.sendQueueUpdate();
      return { jobId: job.jobId, status };
    } catch (error) {
      this.emit('jobFinished', job.jobId, 'failed');
      logger.error(`Error processing print job ${job.jobId}: ${error.message}`, this.mainWindow);
      this.sendQueueUpdate();
      return { jobId: job.jobId, status: 'failed', message: error.message };
    }
  }

  async savePdfToFile(job) {
    await fs.mkdir(this.tempDir, { recursive: true });
    const pdfPath = path.join(this.tempDir, `temp_${job.jobId}.pdf`);
    await fs.writeFile(pdfPath, job.pdfData);
    return pdfPath;
  }

  async cleanupJobFiles(job) {
    const pdfPath = path.join(this.tempDir, `temp_${job.jobId}.pdf`);
    await fs.unlink(pdfPath).catch(err => logger.error(`Error deleting temporary file: ${err.message}`, this.mainWindow));
  }

  getPrinterStatus() {
    return printerManager.getPrinterStatus();
  }

  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      currentlyPrinting: this.isPrinting
    };
  }
  sendQueueUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const queueData = this.queue.map(job => ({
        jobId: job.jobId,
        printerName: job.printerName || 'Unknown Printer',
        status: job.status || 'pending'
      }));
      this.mainWindow.webContents.send('queue-update', queueData);
      // logger.info('Queue update sent to renderer', this.mainWindow);
    } else {
      logger.warn('Cannot send queue update: mainWindow is not available', this.mainWindow);
    }
  }
  
}

module.exports = PrintQueue;