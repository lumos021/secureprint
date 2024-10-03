const { ipcMain } = require('electron');
const authManager = require('../auth/authManager');
const printerManager = require('../printer/printerManager');
const printQueue = require('../printer/printQueue');
const wsClient = require('../websocket/wsClient');
const logger = require('../utils/logger');
const axios = require('axios');
const config = require('../utils/config');
const apiUrl = config.apiUrl;


function setupIPC(mainWindow) {
  logger.info('Setting up IPC handlers', mainWindow);

  ipcMain.handle('login', async (event, credentials) => {
    try {
      const result = await authManager.login(credentials);
      if (result.success) {
        wsClient.connect(result.token);
      }
      return result;
    } catch (error) {
      logger.error(`Login error: ${error.message}`, mainWindow);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('register-client', async (event, registrationData) => {
    try {
      const result = await authManager.register(registrationData);
      if (result.success) {
        wsClient.connect(result.token);
      }
      return result;
    } catch (error) {
      logger.error(`Registration error: ${error.message}`, mainWindow);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('refresh-token', async () => {
    try {
      return await authManager.refreshToken();
    } catch (error) {
      logger.error(`Token refresh error: ${error.message}`, mainWindow);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('request-printer-list', async () => {
    try {
      return await printerManager.getPrintersList();
    } catch (error) {
      logger.error(`Error getting printer list: ${error.message}`, mainWindow);
      throw error;
    }
  });

  ipcMain.handle('toggle-dark-mode', (event, isDarkMode) => {
    mainWindow.webContents.send('dark-mode-changed', isDarkMode);
    return isDarkMode;
  });

  ipcMain.handle('select-printer', async (event, printerName) => {
    try {
      return await printerManager.setDefaultPrinter(printerName);
    } catch (error) {
      logger.error(`Error setting default printer: ${error.message}`, mainWindow);
      throw error;
    }
  });

  ipcMain.handle('cancel-job', async (event, jobId) => {
    try {
      return await printQueue.cancelJob(jobId);
    } catch (error) {
      logger.error(`Error cancelling job: ${error.message}`, mainWindow);
      throw error;
    }
  });

  ipcMain.handle('check-registration', async () => {
    try {
      const authState = await authManager.checkAuthState();
      return authState.isAuthenticated;
    } catch (error) {
      logger.error(`Error checking registration: ${error.message}`, mainWindow);
      return false;
    }
  });

  ipcMain.handle('logout', async () => {
    try {
      await authManager.logout();
      return { success: true };
    } catch (error) {
      console.error('Logout failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('check-auth-state', async () => {
    try {
      const authState = await authManager.checkAuthState();
      return authState.isAuthenticated;
    } catch (error) {
      logger.error(`Error checking auth state: ${error.message}`, mainWindow);
      return false;
    }
  });

  ipcMain.on('queue-update', (event, queue) => {
    event.sender.send('queue-update', queue);
});

  ipcMain.handle('get-daily-stats', async () => {
    try {
      const authState = await authManager.checkAuthState();
      if (!authState.isAuthenticated) {
        throw new Error('User not authenticated');
      }

      const response = await axios.get(`${apiUrl}/api/auth/stats/daily`, {
        headers: { Authorization: `Bearer ${authState.token}` }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching daily stats:', error.message);
      throw error;
    }
  });
  ipcMain.handle('printer-status', async () => {
    try {
      const status = await printerManager.getPrinterStatus();
      return status;
    } catch (error) {
      logger.error(`Error fetching printer status: ${error.message}`, mainWindow);
      throw error;
    }
  });

}

module.exports = { setupIPC };