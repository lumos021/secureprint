// utils/wsMessageHandler.js
const logger = require('./logger');
const clientManager = require('../utils/clientManager.js');


module.exports = async (ws, message) => {
    try {
        const parsedMessage = JSON.parse(message);

        switch (parsedMessage.type) {
          case 'auth':
            logger.info('Received auth message', { userId: ws.userId, clientId: parsedMessage.clientId });
            if (ws.userId && parsedMessage.clientId === ws.userId && parsedMessage.authenticated) {
                clientManager.authenticateClient(ws.userId);
                logger.info('Authentication successful', { userId: ws.userId });
            } else {
                logger.error('Authentication failed', { userId: ws.userId, receivedClientId: parsedMessage.clientId });
            }
            break;

            case 'print-status':
                logger.info('Print job status update', {
                    clientId: ws.userId,
                    jobId: parsedMessage.jobId,
                    status: parsedMessage.status,
                    timestamp: new Date().toISOString()
                });
                break;

            case 'printer-status':
                logger.info('Printer status update', {
                    clientId: ws.userId,
                    status: parsedMessage.status,
                    timestamp: new Date().toISOString()
                });
                break;

            case 'initial_state':
                logger.info('Initial state message received', {
                    clientId: ws.userId,
                    data: parsedMessage.data,
                    timestamp: new Date().toISOString()
                });
                break;

            default:
                logger.warn('Unknown message type', { type: parsedMessage.type, clientId: ws.userId });
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
    } catch (error) {
        logger.error('Error processing WebSocket message', { error: error.message, clientId: ws.userId });
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
};