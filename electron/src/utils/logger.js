const winston = require('winston');
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

function logMessage(message, mainWindow = null, level = 'info') {
    // Always log to file system
    logger[level](message);

    // Only try to send to mainWindow if it exists and appears valid
    if (mainWindow) {
        try {
            if (typeof mainWindow.isDestroyed === 'function' && !mainWindow.isDestroyed()) {
                if (typeof mainWindow.webContents?.send === 'function') {
                    mainWindow.webContents.send('log-message', `[${level.toUpperCase()}] ${message}`);
                }
            }
        } catch (err) {
            // Log the error but don't throw - we still want other logging to continue
            console.error('Error sending log to window:', err.message);
        }
    }
}

module.exports = {
    debug: (message, mainWindow) => logMessage(message, mainWindow, 'debug'),
    info: (message, mainWindow) => logMessage(message, mainWindow, 'info'),
    warn: (message, mainWindow) => logMessage(message, mainWindow, 'warn'),
    error: (message, mainWindow) => logMessage(message, mainWindow, 'error'),
};