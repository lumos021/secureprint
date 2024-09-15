// backend/routes/fileRoutes.js
const express = require('express');
// const router = express.Router();
const upload = require('../middleware/multer');
const fileController = require('../controllers/fileController.js');
const requestTracking = require('../middleware/requestTracking');
const rateLimiter = require('../middleware/rateLimiter');
const config = require('../config');

module.exports = (wss) => {
  const router = express.Router();
// Rate limiting
router.use(rateLimiter);

// Request tracking middleware
router.use(requestTracking);

// Routes (these will be accessed by your web application, not the client)
router.post('/upload', upload.array('files', config.maxFileUploads), fileController.uploadFiles);
router.get('/download/:filename', fileController.downloadFile);
router.get('/info', fileController.getPdfInfo);
router.post('/process', fileController.processFile);
router.post('/finalize', (req, res) => fileController.finalizeFiles(req, res, wss));
router.delete('/delete/:filename', fileController.deleteFile);
// router.post('/cleanup', fileController.cleanupFiles);
router.get('/health', fileController.healthCheck);

return router;
};