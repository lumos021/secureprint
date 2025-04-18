// controllers/fileController.js
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const File = require('../models/fileModel.js');
const pdfParse = require('pdf-parse');
const logger = require('../utils/logger.js');
const sessionManager = require('../utils/sessionManager');
const WorkerPool = require('../utils/workerPool');
const { sanitizeFilename, validateFilename, isValidFileType, validatePrintSettings, getResolvedFilePath } = require('../utils/fileUtils.js');
const { sendPDFToElectronApp } = require('../services/electronService.js');
const PrintJob = require('../models/printJobModel');
const crypto = require('crypto');



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

        const uploadDir = path.join(__dirname, '..', 'uploads');
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
                await fsp.rename(file.path, fileData[index].path);
                const stats = await fsp.stat(fileData[index].path);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                logger.info('File saved', {
                    filename: file.originalname,
                    size: `${fileSizeMB} MB`,
                    requestId: req.requestId,
                });
                sessionManager.addFileToSession(sessionId, fileData[index]);
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
        await fsp.access(directory);
    } catch (err) {
        await fsp.mkdir(directory, { recursive: true });
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
        await fsp.access(filePath, fs.constants.R_OK);
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

    const fileStream = fs.createReadStream(filePath);

    // Handle stream errors
    fileStream.on('error', (err) => {
        logger.error('Error streaming file', {
            error: err.message,
            stack: err.stack,
            requestId: req.requestId,
            filename
        });
        res.status(500).json({ message: 'Error downloading file. Please try again later.' });
        res.end();
    });

    fileStream.pipe(res);

    fileStream.on('end', () => {
        const duration = Date.now() - startTime;
        logger.info('File streamed successfully', {
            requestId: req.requestId,
            filename,
            duration: `${duration}ms`
        });
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
        await fsp.access(filePath);
        const fileBuffer = await fsp.readFile(filePath);
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
    const { printSettings, newFile } = req.body;
    const sessionId = req.headers['x-session-id'];

    logger.info('File processing request received', { requestId: req.requestId, sessionId, printSettings });

    if (!validatePrintSettings(printSettings)) {
        logger.warn('Invalid print settings', { requestId: req.requestId, printSettings });
        return res.status(400).json({ message: 'Invalid print settings' });
    }

    const session = sessionManager.getSession(sessionId); // Initialize session here
    if (!session) {
        logger.warn('Session not found', { requestId: req.requestId, sessionId });
        return res.status(400).json({ message: 'Session not found' });
    }

    const settings = { ...defaultPrintSettings, ...printSettings };
    const pagesPerSheet = parseInt(settings.pagesPerSheet, 10);

    try {
        if (!Array.isArray(session.files) || session.files.length === 0) {
            throw new Error('No files found in session');
        }
        let result;

        if (pagesPerSheet > 1) {
            logger.info('Starting mergeAndCombine task', { filesCount: session.files.length, settings });
            result = await workerPool.runTask({
                type: 'mergeAndCombine',
                filesData: session.files,
                settings: printSettings,
                newFile: newFile || null,
            });
        } else {
            logger.info('Starting individual file processing', { filesCount: session.files.length, settings });
            const processingPromises = session.files.map(file =>
                workerPool.runTask({
                    type: file.mimetype.startsWith('image/') ? 'image' : 'pdf',
                    filePath: getResolvedFilePath(file.filename),
                    processedFilePath: getResolvedFilePath(`processed-${Date.now()}-${sanitizeFilename(file.filename)}`),
                    settings,
                })
            );
            result = await Promise.all(processingPromises);
        }

        logger.info('Task result received', { result: JSON.stringify(result) });

        if (!result) {
            throw new Error('No result returned from worker task');
        }

        // Handling the result based on pagesPerSheet
        if (pagesPerSheet > 1) {
            // Merged file case
            if (!result.success) {
                throw new Error(result.error || 'Error processing merged files');
            }

            const mergedFilename = result.processedFilenames[0]; // Single merged file

            const dbUpdateResult = await File.findOneAndUpdate(
                { filename: sanitizeFilename(session.files[0].filename) },
                {
                    $set: {
                        processedFilename: mergedFilename
                    }
                },
                { upsert: true, new: true }
            );
            logger.debug('Database update result for merged file', { dbUpdateResult });

            session.mergedFiles = result.processedFilenames;

        } else {
            // Individual file case
            const failedTask = result.find(r => !r.success);
            if (failedTask) {
                throw new Error(failedTask.error || 'Error processing files');
            }

            for (let i = 0; i < session.files.length; i++) {
                const file = session.files[i];
                const processedFileName = result[i].processedFilename;

                const dbUpdateResult = await File.findOneAndUpdate(
                    { filename: sanitizeFilename(file.filename) },
                    {
                        $set: {
                            processedFilename: processedFileName
                        }
                    },
                    { upsert: true, new: true }
                );
                logger.debug('Database update result for individual file', { dbUpdateResult });
                // Update the session's processed filename
                file.processedFilename = processedFileName;
            }
        }

        // Update session with processed filenames
        sessionManager.updateLastActivity(sessionId);

        const duration = Date.now() - startTime;
        logger.info('Files processed successfully', { requestId: req.requestId, sessionId, duration: `${duration}ms` });

        return res.status(200).json({
            message: 'Files processed successfully',
            processedFiles: pagesPerSheet > 1 ? result.processedFilenames : result.map(r => r.processedFilename),
        });

    } catch (error) {
        logger.error('Error processing files', {
            error: error.message,
            stack: error.stack,
            requestId: req.requestId,
            sessionId,
            printSettings,
            filesCount: session.files.length
        });
        res.status(500).json({ error: 'Error processing files. Please try again later.' });
    }
};



const finalizeFiles = async (req, res, wss) => {
    const startTime = Date.now();
    const { printSettings, clientId } = req.body;
    const sessionId = req.headers['x-session-id'];
    sessionManager.updateLastActivity(sessionId);
    const jobId = `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

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
            const processedFilename = session.mergedFiles ? session.mergedFiles[0] : file.processedFilename;
            if (!processedFilename || !validateFilename(processedFilename)) {
                throw new Error(`Invalid processed filename: ${processedFilename}`);
            }
            const fileRecord = await File.findOne({ processedFilename: processedFilename });
            if (fileRecord) {
                return { filename: fileRecord.processedFilename };
            } else {
                throw new Error(`Processed file not found: ${processedFilename}`);
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

        const electronResponse = await sendPDFToElectronApp(finalFilePath, clientId, printSettings, jobId);
        try {
            const printJob = new PrintJob({
                jobId,
                sessionId,
                userId: clientId,
                fileId: finalFilename,
                pageCount: mergeResult.pageCount,
                colorMode: printSettings.color === 'color' ? 'color' : 'b&w',
                orientation: printSettings.orientation,
                status: 'pending'
            });

            const savedPrintJob = await printJob.save();
            logger.info('Print job saved successfully', { jobId: savedPrintJob.jobId });
        } catch (saveError) {
            logger.error('Error saving print job', { error: saveError.message, stack: saveError.stack });
            throw saveError; // Ensure error is propagated
        }
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

        await Promise.all(filesToDelete.map(fsp.unlink));
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
                    await fsp.unlink(filePath).catch(err => logger.warn(`Failed to delete file: ${filePath}`, { error: err.message }));

                    if (file.processedFilename) {
                        const processedPath = getResolvedFilePath(file.processedFilename);
                        await fsp.unlink(processedPath).catch(err => logger.warn(`Failed to delete processed file: ${processedPath}`, { error: err.message }));
                    }
                }

                // Delete the final merged file if it exists
                if (session.mergedFilename) {
                    const mergedPath = getResolvedFilePath(session.mergedFilename);
                    await fsp.unlink(mergedPath).catch(err => logger.warn(`Failed to delete merged file: ${mergedPath}`, { error: err.message }));
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