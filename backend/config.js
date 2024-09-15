const path = require('path');

module.exports = {
    serverBaseUrl: 'http://localhost:5000',
    uploadDir: path.resolve(__dirname, './uploads'),
    maxFileUploads: process.env.MAX_FILE_UPLOADS || 15,
    logLevel: process.env.LOG_LEVEL || 'info',
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
    maxFileSize: process.env.MAX_FILE_SIZE || 10 * 1024 * 1024, // 10MB
    websocketPort: 5553,
    healthCheckInterval: 1000000,
    defaultPrintSettings: {
        color: 'b&w',
        orientation: 'portrait'
    }
};