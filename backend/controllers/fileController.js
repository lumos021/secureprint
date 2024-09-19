// controllers/fileController.js
const fs = require('fs').promises;
const path = require('path');
const File = require('../models/fileModel.js');
const pdfParse = require('pdf-parse');
const logger = require('../utils/logger.js');
const sessionManager = require('../utils/sessionManager');
const WorkerPool = require('../utils/workerPool');
const { sanitizeFilename, validateFilename, isValidFileType, validatePrintSettings, getResolvedFilePath } = require('../utils/fileUtils.js');
const { sendPDFToElectronApp } = require('../services/electronService.js');


const workerPool = new WorkerPool(path.join(__dirname, '..', 'workers', 'fileProcessingWorker.js'));

const defaultPrintSettings = {
    color: 'b&w',
    orientation: 'portrait'
};

const uploadFiles = async (req, res) => {
    const startTime = Date.now();
    logger.info('File upload request received', { requestId: req.requestId });
  
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }
  
      // Use /tmp for Cloud Run
      const uploadDir = path.resolve('/tmp/uploads');
      await ensureDirectoryExists(uploadDir);
  
      const invalidFiles = req.files.filter((file) => !isValidFileType(file.mimetype));
      if (invalidFiles.length > 0) {
        return res.status(400).json({ message: 'Invalid file type uploaded' });
      }
  
      const sessionId = req.headers['x-session-id'] || sessionManager.createSession();
      sessionManager.updateLastActivity(sessionId);
  
      const fileData = req.files.map((file) => ({
        filename: sanitizeFilename(file.originalname),
        originalname: file.originalname,
        path: path.join(uploadDir, sanitizeFilename(file.originalname)),
        size: file.size,
        mimetype: file.mimetype,
        uploadDate: new Date(),
        processedFilename: null,
      }));
  
      await Promise.all(
        req.files.map(async (file, index) => {
          try {
            const srcPath = path.resolve(file.path);
            const destPath = path.resolve(fileData[index].path);
            
            logger.info('Copying file', {
              src: srcPath,
              dest: destPath,
              requestId: req.requestId,
            });
  
            await fs.copyFile(srcPath, destPath);
            await fs.unlink(srcPath);  // Delete the original after copying
  
            const stats = await fs.stat(destPath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            
            logger.info('File saved', {
              filename: file.originalname,
              size: `${fileSizeMB} MB`,
              requestId: req.requestId,
            });
  
            // If using Google Cloud Storage
            // await uploadToGCS(destPath, sanitizeFilename(file.originalname));
  
            sessionManager.addFileToSession(sessionId, fileData[index]);
          } catch (error) {
            logger.error('Error processing file', {
              error: error.message,
              stack: error.stack,
              filename: file.originalname,
              requestId: req.requestId,
            });
            throw error;  // Re-throw to be caught by the outer try-catch
          }
        })
      );
  
      const savedFiles = await File.insertMany(fileData);
      const duration = Date.now() - startTime;
      logger.info('Files uploaded successfully', {
        requestId: req.requestId,
        fileCount: savedFiles.length,
        duration: `${duration}ms`,
        sessionId,
      });
  
      res.status(200).json({ message: 'Files uploaded successfully', files: savedFiles, sessionId });
    } catch (error) {
      logger.error('Error uploading files', {
        error: error.message,
        stack: error.stack,
        requestId: req.requestId,
      });
      res.status(500).json({ message: 'Error uploading files. Please try again later.' });
    }
  };
  
  const ensureDirectoryExists = async (directory) => {
    try {
      await fs.access(directory);
    } catch (err) {
      await fs.mkdir(directory, { recursive: true });
    }
  };

const downloadFile = async (req, res) => {
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
};

const getPdfInfo = async (req, res) => {
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
};

const processFile = async (req, res) => {
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
    const processedFileName = `processed-${Date.now()}-${sanitizeFilename(path.basename(filename, path.extname(filename)))}.pdf`;
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

        // Use worker pool for CPU-intensive task
        const result = await workerPool.runTask({
            type: fileExtension === '.pdf' ? 'pdf' : 'image',
            filePath,
            processedFilePath,
            settings
        });

        if (!result.success) {
            throw new Error(result.error);
        }

        await File.findOneAndUpdate(
            { filename: sanitizeFilename(filename) },
            { $set: { processedFilename: processedFileName } },
            { new: true }
        );
        // Update the session with the processed filename
        const sessionId = req.headers['x-session-id'];
        const session = sessionManager.getSession(sessionId);
        sessionManager.updateLastActivity(sessionId);
        if (session) {
            const fileIndex = session.files.findIndex(f => f.filename === sanitizeFilename(filename));
            if (fileIndex !== -1) {
                session.files[fileIndex].processedFilename = processedFileName;
            }
        }

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
};

const finalizeFiles = async (req, res, wss) => {
    const startTime = Date.now();
    const { printSettings, clientId } = req.body;
    const sessionId = req.headers['x-session-id'];
    sessionManager.updateLastActivity(sessionId);

    logger.info('Finalize request received', {
        requestId: req.requestId,
        printSettings,
        clientId,
        sessionId
    });

    if (!validatePrintSettings(printSettings) || !clientId || !sessionId) {
        logger.warn('Invalid print settings, client ID, or session ID', {
            requestId: req.requestId,
            printSettings,
            clientId,
            sessionId
        });
        return res.status(400).json({ message: 'Invalid print settings, client ID, or session ID' });
    }

    try {
        const session = sessionManager.getSession(sessionId);
        if (!session) {
            logger.warn('Session not found', {
                requestId: req.requestId,
                sessionId
            });
            return res.status(404).json({ message: 'Session not found' });
        }

        const filesData = session.files;

        // Process files to ensure we're using processed versions
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

        // Use worker pool for merging PDFs
        const mergeResult = await workerPool.runTask({
            type: 'mergePDFs',
            filesData: processedFilesData,
            printSettings
        });

        if (!mergeResult.success) {
            throw new Error(mergeResult.error);
        }

        const finalFilename = mergeResult.finalFilename;
        const finalFilePath = getResolvedFilePath(finalFilename);

        // Set the merged filename in the session
        sessionManager.setMergedFilename(sessionId, finalFilename);

        const electronResponse = await sendPDFToElectronApp(finalFilePath, wss, clientId, printSettings);

        // After successful sending to Electron app, perform cleanup
        await sessionManager.cleanupSession(session);
        sessionManager.clearSession(sessionId);

        const duration = Date.now() - startTime;
        logger.info('Files merged, sent for printing, and cleaned up', {
            requestId: req.requestId,
            finalFilename,
            duration: `${duration}ms`,
            electronResponse,
            clientId
        });

        res.status(200).json({ message: 'Files merged, sent for printing, and cleaned up', finalFilename });
    } catch (error) {
        logger.error('Error finalizing, printing, or cleaning up PDF', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId,
            clientId,
            sessionId
        });

        if (error.message.includes('Invalid filename') || error.message.includes('Processed file not found')) {
            res.status(400).json({ message: error.message });
        } else if (error.message.includes('Connection to Electron app timed out')) {
            res.status(504).json({ message: 'Printing service is not responding' });
        } else {
            res.status(500).json({ message: 'Error finalizing, printing, or cleaning up PDF' });
        }
    }
};

const deleteFile = async (req, res) => {
    const startTime = Date.now();
    const { filename } = req.params;
    const sessionId = req.headers['x-session-id'];
    sessionManager.updateLastActivity(sessionId);

    logger.info('File deletion request received', {
        requestId: req.requestId,
        filename,
        sessionId
    });

    if (!validateFilename(filename) || !sessionId) {
        logger.warn('Invalid filename or missing session ID', {
            requestId: req.requestId,
            filename,
            sessionId
        });
        return res.status(400).json({ message: 'Invalid filename or missing session ID' });
    }

    try {
        const session = sessionManager.getSession(sessionId);
        if (!session) {
            logger.warn('Session not found', {
                requestId: req.requestId,
                sessionId
            });
            return res.status(404).json({ message: 'Session not found' });
        }

        const fileRecord = session.files.find(file => file.filename === sanitizeFilename(filename));

        if (!fileRecord) {
            logger.warn('File not found in session', {
                requestId: req.requestId,
                filename,
                sessionId
            });
            return res.status(404).json({ message: 'File not found in session' });
        }

        const filesToDelete = [getResolvedFilePath(fileRecord.filename)];

        if (fileRecord.processedFilename) {
            filesToDelete.push(getResolvedFilePath(fileRecord.processedFilename));
        }

        await Promise.all(filesToDelete.map(fs.unlink));
        await File.deleteOne({ filename: sanitizeFilename(filename) });

        sessionManager.removeFileFromSession(sessionId, sanitizeFilename(filename));

        const duration = Date.now() - startTime;
        logger.info('File deleted successfully', {
            requestId: req.requestId,
            filename,
            duration: `${duration}ms`,
            sessionId
        });

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
        logger.error('Error deleting file', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId,
            filename,
            sessionId
        });
        res.status(500).json({ message: 'Error deleting file' });
    }
};

const cleanupInactiveSessions = async () => {
    const sessions = sessionManager.getAllSessions();
    const now = Date.now();
    const inactivityThreshold = 20 * 60 * 1000; // 20 minutes

    for (const [sessionId, session] of sessions) {
        if (now - session.lastActivity > inactivityThreshold) {
            try {
                // Delete all files associated with the session
                for (const file of session.files) {
                    const filePath = getResolvedFilePath(file.filename);
                    await fs.unlink(filePath).catch(err => logger.warn(`Failed to delete file: ${filePath}`, { error: err.message }));
                    
                    if (file.processedFilename) {
                        const processedPath = getResolvedFilePath(file.processedFilename);
                        await fs.unlink(processedPath).catch(err => logger.warn(`Failed to delete processed file: ${processedPath}`, { error: err.message }));
                    }
                }

                // Delete the final merged file if it exists
                if (session.mergedFilename) {
                    const mergedPath = getResolvedFilePath(session.mergedFilename);
                    await fs.unlink(mergedPath).catch(err => logger.warn(`Failed to delete merged file: ${mergedPath}`, { error: err.message }));
                }

                // Remove all file records from the database
                await File.deleteMany({ 
                    $or: [
                        { filename: { $in: session.files.map(f => f.filename) } },
                        { processedFilename: { $in: session.files.map(f => f.processedFilename).filter(Boolean) } }
                    ]
                });

                // Clear the session
                sessionManager.clearSession(sessionId);

                logger.info(`Cleaned up inactive session: ${sessionId}`);
            } catch (error) {
                logger.error(`Error cleaning up session ${sessionId}`, { error: error.message, stack: error.stack });
            }
        }
    }
};


// const cleanupFiles = async (req, res) => {
//     const startTime = Date.now();
//     const { filesData, finalFilename } = req.body;
//     const sessionId = req.headers['x-session-id'];

//     logger.info('Cleanup request received', {
//         requestId: req.requestId,
//         filesCount: filesData.length,
//         finalFilename,
//         sessionId
//     });

//     try {
//         const session = sessionManager.getSession(sessionId);
//         if (!session) {
//             logger.warn('Session not found', {
//                 requestId: req.requestId,
//                 sessionId
//             });
//             return res.status(404).json({ message: 'Session not found' });
//         }

//         const filesToDelete = filesData.map(file => getResolvedFilePath(file.filename));
//         const processedFiles = session.files
//             .filter(file => file.processedFilename)
//             .map(file => getResolvedFilePath(file.processedFilename));

//         filesToDelete.push(...processedFiles, getResolvedFilePath(finalFilename));

//         await Promise.all(filesToDelete.map(fs.unlink));
//         await File.deleteMany({ filename: { $in: filesData.map(file => sanitizeFilename(file.filename)) } });

//         sessionManager.clearSession(sessionId);

//         const duration = Date.now() - startTime;
//         logger.info('Files cleaned up successfully', {
//             requestId: req.requestId,
//             filesCount: filesToDelete.length,
//             duration: `${duration}ms`,
//             sessionId
//         });

//         res.status(200).json({ message: 'Files cleaned up successfully' });
//     } catch (error) {
//         logger.error('Error cleaning up files', {
//             error: error.message,
//             stack: error.stack,
//             requestId: req.requestId,
//             filesData,
//             finalFilename,
//             sessionId
//         });
//         res.status(500).json({ message: 'Error cleaning up files' });
//     }
// };

const healthCheck = (req, res) => {
    const health = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now()
    };
    logger.info('Health check passed', health);
    res.json(health);
};



module.exports = {
    uploadFiles,
    downloadFile,
    getPdfInfo,
    processFile,
    finalizeFiles,
    deleteFile,
    cleanupInactiveSessions,
    healthCheck,
};