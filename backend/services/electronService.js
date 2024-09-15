//backend/services/electronService.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const WebSocket = require('ws');

const CHUNK_SIZE = 1024 * 1024; 
const SEND_TIMEOUT = 30000; 

const sendPDFToElectronApp = async (pdfFilePath, wss, userId, printSettings) => {
    const startTime = Date.now();

    if (!pdfFilePath || typeof pdfFilePath !== 'string') {
        throw new Error('Invalid PDF file path');
    }

    if (!wss || !(wss instanceof WebSocket.Server)) {
        throw new Error('Invalid WebSocket server instance');
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

        // Debugging: Log WebSocket clients
        console.log('WebSocket clients:', Array.from(wss.clients).map(client => ({
            readyState: client.readyState,
            clientId: client.userId,
            authenticated: client.authenticated
        })));
        
        const authenticatedClient = Array.from(wss.clients).find(client =>
            client.readyState === WebSocket.OPEN &&
            client.userId === userId &&  
            client.authenticated
        );

        if (!authenticatedClient) {
            throw new Error('No authenticated Electron client found');
        }

        const sendChunksToClient = async (client) => {
            return new Promise((resolve, reject) => {
                let offset = 0;
                const jobId = Date.now().toString();

                const sendNextChunk = () => {
                    if (offset >= pdfBuffer.length) {
                        client.send(JSON.stringify({ type: 'print', jobId, done: true, printSettings }));
                        resolve();
                        return;
                    }

                    const chunk = pdfBuffer.slice(offset, offset + CHUNK_SIZE);
                    client.send(JSON.stringify({
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
            sendChunksToClient(authenticatedClient),
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