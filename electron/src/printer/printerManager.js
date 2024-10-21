const { getPrinters, print } = require('pdf-to-printer');
const Registry = require('winreg');
const logger = require('../utils/logger');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const EventEmitter = require('events');
const config = require('../utils/config');
const printerPreferences = require('./printerPreferences');
const PrintQueue = require('./printQueue');

class PrinterManager extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.printerStatusCache = new Map();
    this.lastUpdateTime = 0;
    this.updateInterval = config.printerStatusUpdateInterval;
    this.printQueue = new PrintQueue(this);
  }

  async getPrintersList() {
    try {
      const printers = await getPrinters();
      const defaultPrinterName = await this.getDefaultPrinterName();
      return printers.map(printer => ({
        name: printer.name,
        isDefault: printer.name === defaultPrinterName
      }));
    } catch (error) {
      logger.error(`Error getting printers list: ${error.message}`);
      throw error;
    }
  }

  async getDefaultPrinterName() {
    try {
      const regKey = new Registry({
        hive: Registry.HKCU,
        key: '\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows'
      });

      return new Promise((resolve, reject) => {
        regKey.get('Device', (err, item) => {
          if (err) {
            logger.error(`Error getting default printer: ${err.message}`);
            return resolve(null);
          }
          const defaultPrinter = item.value.split(',')[0];
          resolve(defaultPrinter);
        });
      });
    } catch (error) {
      logger.error(`Error in getDefaultPrinterName: ${error.message}`);
      return null;
    }
  }

  async setDefaultPrinter(printerName) {
    try {
      const command = `rundll32 printui.dll,PrintUIEntry /y /n "${printerName}"`;
      await exec(command);
      logger.info(`Default printer set to ${printerName}`);
      return true;
    } catch (error) {
      logger.error(`Error setting default printer: ${error.message}`);
      throw error;
    }
  }

  async startPrintJob(pdfPath, printerName, settings) {
    try {
      // Ensure printerName is a string
      if (typeof printerName !== 'string') {
        logger.error(`Invalid printer name: ${JSON.stringify(printerName)}`);
        return false;
      }
  
      const options = { printer: printerName, ...settings };
  
      // Log the options being passed to the print function
      logger.info(`Starting print job on printer: ${printerName} with options: ${JSON.stringify(options)}`);
  
      await print(pdfPath, options);
  
      this.emit('jobStarted', { printerName, settings });
      logger.info('Print job sent successfully');
      return true;
    } catch (error) {
      logger.error(`Error sending print job: ${error.message}`);
      return false;
    }
  }



  async getPrinterStatus() {
    try {
      const printers = await this.getPrintersList();
      if (!printers || printers.length === 0) {
        logger.warn('No printers found');
        return { status: 'No printers found', printers: [], defaultPrinter: null };
      }

      const defaultPrinterName = await this.getDefaultPrinterName();
      const status = defaultPrinterName
        ? `Default printer is ${defaultPrinterName}`
        : 'No default printer found';

      for (const printer of printers) {
        const printerStatus = await this.checkPrinterActualStatus(printer.name);
        this.printerStatusCache.set(printer.name, {
          ...printer,
          ...printerStatus,
          lastUpdateTime: Date.now()
        });
      }

      logger.info(`Printer status retrieved: ${status}`);

      return {
        status,
        printers: Array.from(this.printerStatusCache.values()),
        defaultPrinter: defaultPrinterName || 'None'
      };
    } catch (error) {
      logger.error(`Error getting printer status: ${error.message}`);
      return { status: 'Error retrieving printer status', printers: [], defaultPrinter: null };
    }
  }

  async checkPrinterActualStatus(printerName) {
    try {
      const escapedPrinterName = printerName.replace(/"/g, '\\"');
      const { stdout } = await exec(`wmic printer where name="${escapedPrinterName}" get WorkOffline,PrinterStatus`);

      const [, status] = stdout.trim().split('\n');
      const [offlineStatus, printerStatus] = status.trim().split(/\s+/);

      const isOffline = offlineStatus.toLowerCase() === 'true';
      const numericStatus = parseInt(printerStatus, 10);

      const isBusy = numericStatus === 4;
      const hasError = [3, 5, 6, 7].includes(numericStatus);

      return { isOffline, isBusy, hasError };
    } catch (error) {
      logger.error(`Error checking printer status: ${error}`);
      return { isOffline: false, isBusy: false, hasError: true };
    }
  }

  async addJob(job) {
    await this.printQueue.addJob(job);
  }

  async cancelJob(jobId) {
    await this.printQueue.cancelJob(jobId);
  }

  getQueueStatus() {
    return this.printQueue.getQueueStatus();
  }

  async getPrinterPreferences(isColorJob) {
    return printerPreferences.getPrinterForJob(isColorJob);
  }

  // Proxy methods for printer preferences
  addPrinterPreference(printerName, isColor, isBW, priority = 0) {
    printerPreferences.addPrinterPreference(printerName, isColor, isBW, priority);
  }

  removePrinterPreference(printerName) {
    printerPreferences.removePrinterPreference(printerName);
  }

  getPrinterPreferences() {
    return printerPreferences.getPrinterPreferences();
  }

  updatePrinterPriority(printerName, newPriority) {
    printerPreferences.updatePrinterPriority(printerName, newPriority);
  }
}

module.exports = PrinterManager;
