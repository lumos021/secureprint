const winston = require('winston');
const { Notification } = require('electron');
const config = require('./config');

const logger = winston.createLogger({
  level: config.debug ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: config.logFile,
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true
    })
  ]
});

function logMessage(message, level = 'info', mainWindow = null) {

  if (typeof logger[level] === 'function') {
    logger[level](message);
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  if (mainWindow) {
    try {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log-message', `[${level.toUpperCase()}] ${message}`);
      }
    } catch (error) {
      console.error('Error sending log message to mainWindow:', error);
    }
  }

  if (level === 'error') {
    new Notification({ title: 'Error', body: message }).show();
  }
}


module.exports = {
  debug: (message, mainWindow) => logMessage(message, 'debug', mainWindow),
  info: (message, mainWindow) => logMessage(message, 'info', mainWindow),
  warn: (message, mainWindow) => logMessage(message, 'warn', mainWindow),
  error: (message, mainWindow) => logMessage(message, 'error', mainWindow),
};