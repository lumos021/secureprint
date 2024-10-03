const { app, BrowserWindow, powerSaveBlocker, powerMonitor } = require('electron');
const path = require('path');
const { setupIPC } = require('./ipc');
const { createMenu } = require('./menu');
const { createTray } = require('./tray');
const authManager = require('../auth/authManager');
const wsClient = require('../websocket/wsClient');
const logger = require('../utils/logger');
const config = require('../utils/config');
const PrintQueue = require('../printer/printQueue');
// const PrinterManager = require('../printer/printerManager');

let mainWindow;
let powerSaveId;
let printQueue;
// let printerManager;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, './preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      geolocation: true
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  wsClient.setMainWindow(mainWindow); 
  printQueue = new PrintQueue(mainWindow);
  setupIPC(mainWindow, printQueue);  
  logger.info('IPC setup complete', mainWindow);
  
  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  createMenu();
  createTray(mainWindow);

  // Initialize PrinterManager with mainWindow
  // printerManager = new PrinterManager(mainWindow);

  const authState = await authManager.checkAuthState();
  logger.info(`Auth state: ${JSON.stringify(authState)}`, mainWindow);
  
  if (authState.isAuthenticated) {
    logger.info('Attempting to connect WebSocket...', mainWindow);
    wsClient.connect(authState.token);
  } else {
    logger.info('Not authenticated, sending register-client event', mainWindow);
    mainWindow.webContents.send('register-client');
  }
};

async function cleanupTempFiles() {
  // Implement cleanup logic here
  logger.info('Cleaning up temporary files', mainWindow);
}

app.whenReady().then(() => {
  powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  powerSaveBlocker.stop(powerSaveId);
  wsClient.close();
  await cleanupTempFiles();
  logger.info('Application is quitting', mainWindow);
});

powerMonitor.on('suspend', () => {
  logger.info('The system is going to sleep', mainWindow);
  wsClient.close();
});

powerMonitor.on('resume', async () => {
  logger.info('The system is waking up', mainWindow);
  const authState = await authManager.checkAuthState();
  if (authState.isAuthenticated) {
    wsClient.connect(authState.token);
  }
});

module.exports = { 
  getMainWindow: () => mainWindow,
  getPrintQueue: () => printQueue
};