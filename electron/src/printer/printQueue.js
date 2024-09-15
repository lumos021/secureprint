const fs = require('fs').promises;
const path = require('path');
const printerManager = require('./printerManager');
const logger = require('../utils/logger');
const config = require('../utils/config');

class PrintQueue {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.queue = [];
    this.isPrinting = false;
    this.tempDir = path.join(config.tempDir, 'pdfs');
  }

  async addJob(job) {
    this.queue.push(job);
    this.sortPrintQueue();
    logger.info(`Added job ${job.jobId} to the print queue`, this.mainWindow);
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
      const pdfPath = await this.savePdfToFile(job);
      const printResult = await printerManager.startPrintJob(pdfPath, job.printerName, job.settings);
      const status = printResult ? 'success' : 'failed';
      logger.info(`Print job ${job.jobId} ${status}`, this.mainWindow);
      await this.cleanupJobFiles(job);
      return { jobId: job.jobId, status };
    } catch (error) {
      logger.error(`Error processing print job ${job.jobId}: ${error.message}`, this.mainWindow);
      return { jobId: job.jobId, status: 'error', message: error.message };
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
}

module.exports = new PrintQueue();
