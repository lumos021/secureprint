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

        const invalidFiles = req.files.filter(file => !isValidFileType(file.mimetype));
        if (invalidFiles.length > 0) {
            return res.status(400).json({ message: 'Invalid file type uploaded' });
        }

        const sessionId = req.headers['x-session-id'] || sessionManager.createSession();
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
            sessionManager.addFileToSession(sessionId, fileData[index]);
        }));

        const savedFiles = await File.insertMany(fileData);
        const duration = Date.now() - startTime;
        logger.info('Files uploaded successfully', {
            requestId: req.requestId,
            fileCount: savedFiles.length,
            duration: `${duration}ms`,
            sessionId
        });
        res.status(200).json({ message: 'Files uploaded successfully', files: savedFiles, sessionId });
    } catch (error) {
        logger.error('Error uploading files', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId
        });
        res.status(500).json({ message: 'Error uploading files. Please try again later.' });
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

        console.log(`Merged ${processedFilesData.length} files into ${mergeResult.finalFilename}`);
        const finalFilename = mergeResult.finalFilename;
        const finalFilePath = getResolvedFilePath(finalFilename);

        const electronResponse = await sendPDFToElectronApp(finalFilePath, wss, clientId, printSettings);

        // After successful sending to Electron app, perform cleanup
        await cleanupAfterFinalize(session, finalFilename);

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

const cleanupAfterFinalize = async (session, finalFilename) => {
    const filesToDelete = [];

    // Add original and processed files
    for (const file of session.files) {
        filesToDelete.push(getResolvedFilePath(file.filename));
        if (file.processedFilename) {
            filesToDelete.push(getResolvedFilePath(file.processedFilename));
        }
    }

    // Add the final merged file
    filesToDelete.push(getResolvedFilePath(finalFilename));

    // Delete files from uploads directory
    for (const filePath of filesToDelete) {
        try {
            await fs.unlink(filePath);
            logger.info(`Deleted file: ${filePath}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.warn(`Failed to delete file: ${filePath}`, { error: error.message });
            }
        }
    }

    // Delete files from database
    const filenames = session.files.map(file => sanitizeFilename(file.filename));
    const processedFilenames = session.files
        .filter(file => file.processedFilename)
        .map(file => file.processedFilename);

    await File.deleteMany({
        $or: [
            { filename: { $in: filenames } },
            { processedFilename: { $in: processedFilenames } }
        ]
    });

    // Clear the session
    sessionManager.clearSession(session.id);

    logger.info('Cleanup completed', {
        sessionId: session.id,
        deletedFilesCount: filesToDelete.length
    });
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

const cleanupInactiveSessions = () => {
    sessionManager.cleanupInactiveSessions();
};

// Set up a periodic task to clean up inactive sessions
setInterval(cleanupInactiveSessions, 5 * 60 * 1000); // Run every 5 minutes

module.exports = {
    uploadFiles,
    downloadFile,
    getPdfInfo,
    processFile,
    finalizeFiles,
    deleteFile,
    //   cleanupFiles,
    healthCheck,
};