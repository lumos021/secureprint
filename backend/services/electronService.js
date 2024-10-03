// backend/services/electronService.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const WebSocket = require('ws');
const clientManager = require('../utils/clientManager');

const CHUNK_SIZE = 1024 * 1024;
const SEND_TIMEOUT = 30000;

const sendPDFToElectronApp = async (pdfFilePath, userId, printSettings,jobId) => {
    const startTime = Date.now();
    logger.info('Attempting to send PDF to Electron', { userId, pdfFilePath });

    if (!pdfFilePath || typeof pdfFilePath !== 'string') {
        throw new Error('Invalid PDF file path');
    }

    try {
        const pdfBuffer = await fs.readFile(pdfFilePath);
        const fileSize = (pdfBuffer.length / 1024 / 1024).toFixed(2);
        logger.info('Sending PDF to Electron for printing', {
            fileSize: `${fileSize} MB`,
            filename: path.basename(pdfFilePath),
            timestamp: new Date().toISOString(),
            userId
        });

        // Debugging: Log authenticated clients
        const authenticatedClients = clientManager.getAuthenticatedClients();
        logger.info('Authenticated WebSocket clients:',
            authenticatedClients.map(client => ({
                clientId: client.userId,
                readyState: client.ws.readyState
            }))
        );

        if (!clientManager.isClientAuthenticated(userId)) {
            throw new Error('No authenticated Electron client found');
        }

        logger.info('Attempting to send PDF to Electron', { userId, pdfFilePath });

        const isAuthenticated = clientManager.isClientAuthenticated(userId);
        logger.info('Client authentication status', { userId, isAuthenticated });

        if (!isAuthenticated) {
            logger.error('No authenticated Electron client found', { userId });
            throw new Error('No authenticated Electron client found');
        }

        const client = clientManager.getClient(userId);
        if (!client || client.ws.readyState !== WebSocket.OPEN) {
            logger.error('Authenticated client not found or not in OPEN state', {
                userId,
                clientFound: !!client,
                readyState: client ? client.ws.readyState : 'N/A'
            });
            throw new Error('Authenticated client not found or not in OPEN state');
        }

        const sendChunksToClient = async (clientWs) => {
            return new Promise((resolve, reject) => {
                let offset = 0;
                // const jobId = Date.now().toString();
                console.log(jobId)

                const sendNextChunk = () => {
                    if (offset >= pdfBuffer.length) {
                        clientWs.send(JSON.stringify({ type: 'print', jobId, done: true, printSettings }));
                        resolve();
                        return;
                    }

                    const chunk = pdfBuffer.slice(offset, offset + CHUNK_SIZE);
                    clientWs.send(JSON.stringify({
                        type: 'print',
                        jobId,
                        chunk: chunk.toString('base64'),
                        offset,
                        total: pdfBuffer.length,
                        printSettings
                    }), (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            offset += chunk.length;
                            sendNextChunk();
                        }
                    });
                };

                sendNextChunk();
            });
        };

        const result = await Promise.race([
            sendChunksToClient(client.ws),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), SEND_TIMEOUT))
        ]);

        const duration = Date.now() - startTime;
        logger.info('PDF sent to Electron app', {
            duration: `${duration}ms`,
            fileSize: `${fileSize} MB`,
            userId
        });

        return `PDF sent to authenticated Electron client ${userId} via WebSocket`;
    } catch (error) {
        logger.error('Failed to send PDF to Electron app', {
            error: error.message,
            stack: error.stack,
            pdfFilePath,
            userId
        });
        throw new Error(`Failed to send PDF to Electron app: ${error.message}`);
    }
};

module.exports = {
    sendPDFToElectronApp
};