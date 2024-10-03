const { getPrinters, print } = require('pdf-to-printer');
const Registry = require('winreg');
const { exec } = require('child_process');
const logger = require('../utils/logger');

class PrinterManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
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
      logger.error(`Error getting printers list: ${error.message}`, this.mainWindow);
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
            logger.error(`Error getting default printer: ${err.message}`, this.mainWindow);
            return resolve(null);
          }
          const defaultPrinter = item.value.split(',')[0];
          resolve(defaultPrinter);
        });
      });
    } catch (error) {
      logger.error(`Error in getDefaultPrinterName: ${error.message}`, this.mainWindow);
      return null;
    }
  }

  async setDefaultPrinter(printerName) {
    try {
      const command = `rundll32 printui.dll,PrintUIEntry /y /n "${printerName}"`;
      await new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
      logger.info(`Default printer set to ${printerName}`, this.mainWindow);
      return true;
    } catch (error) {
      logger.error(`Error setting default printer: ${error.message}`, this.mainWindow);
      throw error;
    }
  }

  async startPrintJob(pdfPath, printerName, settings) {
    try {
      const options = { printer: printerName, ...settings };
      await print(pdfPath, options);
      logger.info('Print job sent successfully', this.mainWindow);
      return true;
    } catch (error) {
      logger.error(`Error sending print job: ${error.message}`, this.mainWindow);
      return false;
    }
  }

  async getPrinterStatus() {
    try {
      const printers = await this.getPrintersList();
      if (!printers || printers.length === 0) {
        logger.warn('No printers found', this.mainWindow);
        return { status: 'No printers found', printers: [], defaultPrinter: null };
      }
  
      const defaultPrinterName = await this.getDefaultPrinterName();
      if (!defaultPrinterName) {
        logger.warn('No default printer set', this.mainWindow);
      }
  
      const status = defaultPrinterName 
        ? `Default printer is ${defaultPrinterName}` 
        : 'No default printer found';
  
      logger.info(`Printer status retrieved: ${status}`, this.mainWindow);
  
      return { status, printers, defaultPrinter: defaultPrinterName || 'None' };
    } catch (error) {
      logger.error(`Error getting printer status: ${error.message}`, this.mainWindow);
      return { status: 'Error retrieving printer status', printers: [], defaultPrinter: null };
    }
  }
  
}

module.exports = new PrinterManager();