const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { PDFDocument, degrees } = require('pdf-lib');
const upload = require('../multerMiddleware');
const File = require('../models/fileModel');
const pdfParse = require('pdf-parse');
const { convertToBlackAndWhite, rotatePDFToLandscape, mergeProcessedPDFs } = require('../utils/pdfUtils');
const config = require('../config');
const { validateFilename, sanitizeFilename } = require('../utils/fileUtils');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const wss = new WebSocket.Server({ port: 5553 });

// WebSocket server event listeners
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  logger.info('WebSocket client connected', { clientIp });

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      logger.info('Received message from client', {
        message: parsedMessage,
        timestamp: new Date().toISOString()
      });

      if (parsedMessage.type === 'print-status') {
        logger.info('Print job status update', {
          jobId: parsedMessage.jobId,
          status: parsedMessage.status,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Error parsing WebSocket message', {
        error: error.message,
        rawMessage: message
      });
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected', { clientIp });
  });
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

router.use(apiLimiter);

// Request tracking middleware
router.use((req, res, next) => {
  req.requestId = uuidv4();
  next();
});

// Default print settings
const defaultPrintSettings = {
  color: 'b&w',
  orientation: 'portrait'
};

// Utility functions
const isValidFileType = (mimetype) => {
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  return allowedMimeTypes.includes(mimetype);
};

const getResolvedFilePath = (filename) => path.resolve(config.uploadDir, sanitizeFilename(filename));

const validatePrintSettings = (settings) => {
  const validColors = ['b&w', 'color'];
  const validOrientations = ['portrait', 'landscape'];
  return validColors.includes(settings.color) && validOrientations.includes(settings.orientation);
};

// Handle file uploads
router.post('/upload', upload.array('files', config.maxFileUploads), async (req, res) => {
  const startTime = Date.now();
  logger.info('File upload request received', { requestId: req.requestId });

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const invalidFiles = req.files.filter(file => !isValidFileType(file.mimetype));
    if (invalidFiles.length > 0) {
      return res.status(400).json({ message: 'Invalid file type uploaded' });
    }

    const fileData = req.files.map(file => ({
      filename: sanitizeFilename(file.originalname),
      originalname: file.originalname,
      path: getResolvedFilePath(sanitizeFilename(file.originalname)),
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: new Date(),
      processedFilename: null
    }));

    await Promise.all(req.files.map(async (file, index) => {
      await fs.rename(file.path, fileData[index].path);
      const stats = await fs.stat(fileData[index].path);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      logger.info(`File saved`, {
        filename: file.originalname,
        size: `${fileSizeMB} MB`,
        requestId: req.requestId
      });
    }));

    const savedFiles = await File.insertMany(fileData);
    const duration = Date.now() - startTime;
    logger.info('Files uploaded successfully', {
      requestId: req.requestId,
      fileCount: savedFiles.length,
      duration: `${duration}ms`
    });
    res.status(200).json({ message: 'Files uploaded successfully', files: savedFiles });
  } catch (error) {
    logger.error('Error uploading files', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId
    });
    res.status(500).json({ message: 'Error uploading files. Please try again later.' });
  }
});

// Handle file downloads
router.get('/download/:filename', async (req, res) => {
  const startTime = Date.now();
  const filename = req.params.filename;
  let filePath = getResolvedFilePath(filename);

  logger.info('File download request received', {
    requestId: req.requestId,
    filename
  });

  try {
    await fs.access(filePath, fs.constants.R_OK);
  } catch (error) {
    const fileRecord = await File.findOne({
      $or: [
        { filename: sanitizeFilename(filename) },
        { processedFilename: filename }
      ]
    });

    if (fileRecord && fileRecord.processedFilename) {
      filePath = getResolvedFilePath(fileRecord.processedFilename);
    } else {
      logger.warn('File not found', {
        requestId: req.requestId,
        filename
      });
      return res.status(404).json({ message: 'File not found' });
    }
  }

  res.sendFile(filePath, (err) => {
    if (err) {
      logger.error('Error sending file', {
        error: err.message,
        stack: err.stack,
        requestId: req.requestId,
        filename
      });
      res.status(500).json({ message: 'Error downloading file. Please try again later.' });
    } else {
      const duration = Date.now() - startTime;
      logger.info('File downloaded successfully', {
        requestId: req.requestId,
        filename,
        duration: `${duration}ms`
      });
    }
  });
});

// Get PDF info
router.get('/info', async (req, res) => {
  const startTime = Date.now();
  const { filename } = req.query;

  logger.info('PDF info request received', {
    requestId: req.requestId,
    filename
  });

  if (!validateFilename(filename)) {
    logger.warn('Invalid filename', {
      requestId: req.requestId,
      filename
    });
    return res.status(400).json({ message: 'Invalid filename' });
  }

  const filePath = getResolvedFilePath(filename);

  try {
    await fs.access(filePath);
    const fileBuffer = await fs.readFile(filePath);
    const pdfData = await pdfParse(fileBuffer);
    const duration = Date.now() - startTime;
    logger.info('PDF info retrieved successfully', {
      requestId: req.requestId,
      filename,
      pages: pdfData.numpages,
      duration: `${duration}ms`
    });
    res.json({ pages: pdfData.numpages });
  } catch (error) {
    logger.error('Error reading PDF file', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      filename
    });
    res.status(500).json({ message: 'Error reading PDF file. Please try again later.' });
  }
});

// Process uploaded files
router.post('/process', async (req, res) => {
  const startTime = Date.now();
  const { filename, printSettings } = req.body;

  logger.info('File processing request received', {
    requestId: req.requestId,
    filename,
    printSettings
  });

  if (!validateFilename(filename) || !validatePrintSettings(printSettings)) {
    logger.warn('Invalid filename or print settings', {
      requestId: req.requestId,
      filename,
      printSettings
    });
    return res.status(400).json({ message: 'Invalid filename or print settings' });
  }

  const settings = { ...defaultPrintSettings, ...printSettings };
  const filePath = getResolvedFilePath(filename);
  const processedFileName = `processed-${Date.now()}-${sanitizeFilename(filename)}`;
  const processedFilePath = getResolvedFilePath(processedFileName);

  try {
    await fs.access(filePath);
    const fileExtension = path.extname(filename).toLowerCase();

    if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(fileExtension)) {
      logger.warn('Unsupported file type', {
        requestId: req.requestId,
        filename,
        fileExtension
      });
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const processingFunction = fileExtension === '.pdf' ? handlePdfProcessing : handleImageProcessing;
    await processingFunction(filePath, processedFilePath, settings);

    await File.findOneAndUpdate(
      { filename: sanitizeFilename(filename) },
      { $set: { processedFilename: processedFileName } },
      { new: true }
    );

    const duration = Date.now() - startTime;
    logger.info('File processed successfully', {
      requestId: req.requestId,
      filename,
      processedFilename: processedFileName,
      duration: `${duration}ms`
    });

    return res.status(200).json({ message: 'File processed successfully', processedFilePath: processedFileName });
  } catch (error) {
    logger.error('Error processing file', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      filename
    });
    res.status(500).json({ error: 'Error processing file. Please try again later.' });
  }
});

// Function to process PDF files
const handlePdfProcessing = async (filePath, processedFilePath, printSettings) => {
  const startTime = Date.now();
  try {
    if (printSettings.color === 'b&w') {
      await convertToBlackAndWhite(filePath, processedFilePath);
      if (printSettings.orientation === 'landscape') {
        await rotatePDFToLandscape(processedFilePath, processedFilePath);
      }
    } else {
      const existingPdfBytes = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);

      if (printSettings.orientation === 'landscape') {
        pdfDoc.getPages().forEach(page => page.setRotation(degrees(90)));
      }

      const pdfBytes = await pdfDoc.save();
      await fs.writeFile(processedFilePath, pdfBytes);
    }
    const duration = Date.now() - startTime;
    logger.info('PDF processing completed', {
      filePath,
      processedFilePath,
      printSettings,
      duration: `${duration}ms`
    });
  } catch (error) {
    logger.error('Error processing PDF file', {
      error: error.message,
      stack: error.stack,
      filePath,
      processedFilePath,
      printSettings
    });
    throw new Error('Error processing PDF file');
  }
};

// Function to process image files
const handleImageProcessing = async (filePath, processedFilePath, printSettings) => {
  const startTime = Date.now();
  try {
    const imageBytes = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.create();
    const embeddedImage = path.extname(filePath).toLowerCase() === '.png' 
      ? await pdfDoc.embedPng(imageBytes) 
      : await pdfDoc.embedJpg(imageBytes);

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });

    if (printSettings.orientation === 'landscape') {
      page.setRotation(degrees(90));
    }

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(processedFilePath, pdfBytes);

    if (printSettings.color === 'b&w') {
      await convertToBlackAndWhite(processedFilePath, processedFilePath);
    }

    const duration = Date.now() - startTime;
    logger.info('Image processing completed', {
      filePath,
      processedFilePath,
      printSettings,
      duration: `${duration}ms`
    });
  } catch (error) {
    logger.error('Error processing image file', {
      error: error.message,
      stack: error.stack,
      filePath,
      processedFilePath,
      printSettings
    });
    throw new Error('Error processing image file');
  }
};

// Send PDF to Electron app
const sendPDFToElectronApp = async (pdfFilePath) => {
  const startTime = Date.now();
  try {
    const pdfBuffer = await fs.readFile(pdfFilePath);
    const fileSize = (pdfBuffer.length / 1024 / 1024).toFixed(2);

    logger.info('Sending PDF to Electron for printing', {
      fileSize: `${fileSize} MB`,
      filename: path.basename(pdfFilePath),
      timestamp: new Date().toISOString()
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'print',
          pdfData: pdfBuffer.toString('base64')
        }));
      }
    });

    const duration = Date.now() - startTime;
    logger.info('PDF sent to Electron app', {
      duration: `${duration}ms`,
      fileSize: `${fileSize} MB`
    });

    return 'PDF sent to Electron app via WebSocket';
  } catch (error) {
    logger.error('Failed to send PDF to Electron app', {
      error: error.message,
      stack: error.stack,
      pdfFilePath
    });
    throw new Error(`Failed to send PDF to Electron app: ${error.message}`);
  }
};

// Finalize and combine PDFs
router.post('/finalize', async (req, res) => {
  const startTime = Date.now();
  const { filesData, printSettings } = req.body;

  logger.info('Finalize request received', {
    requestId: req.requestId,
    filesCount: filesData.length,
    printSettings
  });

  if (!Array.isArray(filesData) || filesData.length === 0 || !validatePrintSettings(printSettings)) {
    logger.warn('Invalid files data or print settings', {
      requestId: req.requestId,
      filesData,
      printSettings
    });
    return res.status(400).json({ message: 'Invalid files data or print settings' });
}

try {
  const processedFilesData = await Promise.all(filesData.map(async (file) => {
    const sanitizedFilename = sanitizeFilename(file.filename);
    if (!validateFilename(sanitizedFilename)) {
      throw new Error(`Invalid filename: ${sanitizedFilename}`);
    }
    const fileRecord = await File.findOne({ filename: sanitizedFilename });
    if (fileRecord && fileRecord.processedFilename) {
      return { filename: fileRecord.processedFilename };
    } else {
      throw new Error(`Processed file not found for ${sanitizedFilename}`);
    }
  }));

  const finalPdfBytes = await mergeProcessedPDFs(processedFilesData);
  const finalFilename = `final-${Date.now()}.pdf`;
  const finalFilePath = getResolvedFilePath(finalFilename);

  await fs.writeFile(finalFilePath, finalPdfBytes);
  const electronResponse = await sendPDFToElectronApp(finalFilePath);

  const duration = Date.now() - startTime;
  logger.info('Files merged and sent for printing', {
    requestId: req.requestId,
    finalFilename,
    duration: `${duration}ms`,
    electronResponse
  });

  res.status(200).json({ message: 'Files merged and sent for printing', finalFilename });
} catch (error) {
  logger.error('Error finalizing and printing PDF', {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
    filesData
  });
  if (error.message.includes('Invalid filename') || error.message.includes('Processed file not found')) {
    res.status(400).json({ message: error.message });
  } else if (error.message.includes('Connection to Electron app timed out')) {
    res.status(504).json({ message: 'Printing service is not responding' });
  } else {
    res.status(500).json({ message: 'Error finalizing and printing PDF' });
  }
}
});

// Delete a single file (original and processed)
router.delete('/delete/:filename', async (req, res) => {
const startTime = Date.now();
const { filename } = req.params;

logger.info('File deletion request received', {
  requestId: req.requestId,
  filename
});

if (!validateFilename(filename)) {
  logger.warn('Invalid filename', {
    requestId: req.requestId,
    filename
  });
  return res.status(400).json({ message: 'Invalid filename' });
}

try {
  const fileRecord = await File.findOne({ filename: sanitizeFilename(filename) });

  if (!fileRecord) {
    logger.warn('File not found', {
      requestId: req.requestId,
      filename
    });
    return res.status(404).json({ message: 'File not found' });
  }

  const filesToDelete = [getResolvedFilePath(fileRecord.filename)];

  if (fileRecord.processedFilename) {
    filesToDelete.push(getResolvedFilePath(fileRecord.processedFilename));
  }

  await Promise.all(filesToDelete.map(fs.unlink));
  await File.deleteOne({ filename: sanitizeFilename(filename) });

  const duration = Date.now() - startTime;
  logger.info('File deleted successfully', {
    requestId: req.requestId,
    filename,
    duration: `${duration}ms`
  });

  res.status(200).json({ message: 'File deleted successfully' });
} catch (error) {
  logger.error('Error deleting file', {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
    filename
  });
  res.status(500).json({ message: 'Error deleting file' });
}
});

// Delete all files (original, processed, and final merged) after print job
router.post('/cleanup', async (req, res) => {
const startTime = Date.now();
const { filesData, finalFilename } = req.body;

logger.info('Cleanup request received', {
  requestId: req.requestId,
  filesCount: filesData.length,
  finalFilename
});

try {
  const filesToDelete = filesData.map(file => getResolvedFilePath(file.filename));
  const processedFiles = await Promise.all(filesData.map(async file => {
    const record = await File.findOne({ filename: sanitizeFilename(file.filename) });
    return record?.processedFilename ? getResolvedFilePath(record.processedFilename) : null;
  }));

  filesToDelete.push(...processedFiles.filter(Boolean), getResolvedFilePath(finalFilename));

  await Promise.all(filesToDelete.map(fs.unlink));
  await File.deleteMany({ filename: { $in: filesData.map(file => sanitizeFilename(file.filename)) } });

  const duration = Date.now() - startTime;
  logger.info('Files cleaned up successfully', {
    requestId: req.requestId,
    filesCount: filesToDelete.length,
    duration: `${duration}ms`
  });

  res.status(200).json({ message: 'Files cleaned up successfully' });
} catch (error) {
  logger.error('Error cleaning up files', {
    error: error.message,
    stack: error.stack,
    requestId: req.requestId,
    filesData,
    finalFilename
  });
  res.status(500).json({ message: 'Error cleaning up files' });
}
});

// Health check endpoint
router.get('/health', (req, res) => {
const health = {
  uptime: process.uptime(),
  message: 'OK',
  timestamp: Date.now()
};
logger.info('Health check passed', health);
res.json(health);
});

// Periodic health check
setInterval(() => {
const health = {
  uptime: process.uptime(),
  responseTime: process.cpuUsage(),
  memoryUsage: process.memoryUsage()
};
logger.info('Periodic health check', health);
}, 300000); // every 5 minutes

module.exports = router;