const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

class PrintQueue extends EventEmitter {
  constructor(printerManager) {
    super();
    this.printerManager = printerManager;
    this.queues = new Map();
    this.isPrinting = false;
    this.tempDir = path.join(config.tempDir, 'pdfs');
  }

  async addJob(job) {
    const printerName = await this.selectPrinterForJob(job);
    if (!this.queues.has(printerName)) {
      this.queues.set(printerName, []);
    }
    this.queues.get(printerName).push(job);
    logger.info(`Added job ${job.jobId} to queue for printer ${printerName}`);
    this.emit('queueUpdated', this.getQueueStatus());
    if (!this.isPrinting) {
      await this.processPrintQueues();
    }
  }

  async selectPrinterForJob(job) {
    const isColorJob = job.settings.color === 'color';
    const printerStatus = await this.printerManager.getPrinterStatus();
    const preferredPrinters = await this.printerManager.getPrinterPreferences(isColorJob);
  
    // Log the printers and preferences
    logger.info(`Job settings: ${JSON.stringify(job.settings)}`);
    logger.info(`Preferred printers for ${isColorJob ? 'color' : 'B&W'}: ${JSON.stringify(preferredPrinters)}`);
    logger.info(`Printer statuses: ${JSON.stringify(printerStatus)}`);
  
    // Filter printers based on job requirements
    const eligiblePrinters = preferredPrinters.filter(printer =>
      (isColorJob ? printer.isColor : printer.isBW) &&
      printerStatus.printers.some(p => p.name === printer.printerName)
    );
  
    // Sort eligible printers by preference and queue length
    const sortedPrinters = eligiblePrinters
      .map(printer => ({
        name: printer.printerName,
        queueLength: (this.queues.get(printer.printerName) || []).length,
        status: printerStatus.printers.find(p => p.name === printer.printerName) || {}
      }))
      .sort((a, b) => {
        if (a.queueLength !== b.queueLength) {
          return a.queueLength - b.queueLength; // Shorter queue first
        }
        return preferredPrinters.findIndex(p => p.printerName === a.name) - preferredPrinters.findIndex(p => p.printerName === b.name); // Higher preference first
      });
  
    // Log sorted printers
    logger.info(`Sorted printers: ${JSON.stringify(sortedPrinters)}`);
  
    // If no eligible printers, fall back to the default printer
    if (sortedPrinters.length === 0) {
      const defaultPrinter = printerStatus.defaultPrinter;
      logger.warn(`No eligible ${isColorJob ? 'color' : 'B&W'} printers available. Falling back to default printer: ${defaultPrinter}`);
      return defaultPrinter; // Use default printer if no eligible printer
    }
  
    // Select the first available printer
    for (const printer of sortedPrinters) {
      if (!printer.status.isBusy && !printer.status.isOffline && !printer.status.hasError) {
        logger.info(`Selected printer: ${printer.name}`);
        return printer.name;
      }
    }
  
    // If all printers are busy, select the one with the shortest queue
    logger.info(`All printers busy. Selecting printer with shortest queue: ${sortedPrinters[0].name}`);
    return sortedPrinters[0].name;
  }
  

  async processPrintQueues() {
    if (this.isPrinting) return;
    this.isPrinting = true;
    logger.info('Started processing print queues');

    while (this.queues.size > 0) {
      for (const [printerName, queue] of this.queues) {
        if (queue.length > 0) {
          const job = queue.shift();
          await this.processPrintJob(job, printerName);
        }
        if (queue.length === 0) {
          this.queues.delete(printerName);
        }
      }
    }

    this.isPrinting = false;
    logger.info('Finished processing print queues');
    this.emit('queueUpdated', this.getQueueStatus());
  }

  async processPrintJob(job, printerName) {
    try {
      this.emit('jobStarted', job.jobId);
      const pdfPath = await this.savePdfToFile(job);
  
      // Verify the printer exists and is ready
      const printerStatus = await this.printerManager.getPrinterStatus();
      const selectedPrinter = printerStatus.printers.find(p => p.name === printerName);
      
      if (!selectedPrinter) {
        throw new Error(`Selected printer "${printerName}" not found`);
      }
      
      if (selectedPrinter.isOffline || selectedPrinter.hasError) {
        throw new Error(`Selected printer "${printerName}" is offline or has an error`);
      }
  
      const printResult = await this.printerManager.startPrintJob(pdfPath, printerName, job.settings);
      const status = printResult ? 'completed' : 'failed';
      this.emit('jobFinished', job.jobId, status);
      logger.info(`Print job ${job.jobId} ${status} on printer ${printerName}`);
      await this.cleanupJobFiles(job);
      return { jobId: job.jobId, status };
    } catch (error) {
      this.emit('jobFinished', job.jobId, 'failed');
      logger.error(`Error processing print job ${job.jobId} on printer ${printerName}: ${error.message}`);
      return { jobId: job.jobId, status: 'failed', message: error.message };
    }
  }

  async cancelJob(jobId) {
    let canceledJob = null;

    for (const [printerName, queue] of this.queues) {
      const index = queue.findIndex(job => job.jobId === jobId);
      if (index !== -1) {
        canceledJob = queue.splice(index, 1)[0];
        break;
      }
    }

    if (canceledJob) {
      await this.cleanupJobFiles(canceledJob);
      logger.info(`Print job ${jobId} canceled`);
      this.emit('jobCanceled', jobId);
    } else {
      logger.warn(`Print job ${jobId} not found in any queue`);
    }

    this.emit('queueUpdated', this.getQueueStatus());
  }

  getQueueStatus() {
    const status = {};
    for (const [printerName, queue] of this.queues) {
      status[printerName] = queue.length;
    }
    return {
      queues: status,
      currentlyPrinting: this.isPrinting
    };
  }

  async savePdfToFile(job) {
    await fs.mkdir(this.tempDir, { recursive: true });
    const pdfPath = path.join(this.tempDir, `temp_${job.jobId}.pdf`);
    await fs.writeFile(pdfPath, job.pdfData);
    return pdfPath;
  }

  async cleanupJobFiles(job) {
    const pdfPath = path.join(this.tempDir, `temp_${job.jobId}.pdf`);
    await fs.unlink(pdfPath).catch(err => logger.error(`Error deleting temporary file: ${err.message}`));
  }
}

module.exports = PrintQueue;