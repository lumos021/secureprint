// wsServer.js
const WebSocket = require('ws');
const logger = require('./utils/logger');
const wsAuthMiddleware = require('./middleware/wsAuthMiddleware.js');
const clientManager = require('./utils/clientManager.js');

const createWebSocketServer = (server) => {
    const wss = new WebSocket.Server({
        server,
        clientTracking: true,
        maxPayload: 50 * 1024 * 1024,
        keepaliveInterval: 20000,
        keepaliveGracePeriod: 10000
    });

    wss.on('connection', async (ws, req) => {
        ws.isAlive = true;
        await wsAuthMiddleware(ws, req);
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                logger.warn('Client connection terminated due to inactivity', { userId: ws.userId });
                clientManager.removeClient(ws.userId);
                return ws.terminate();
            }

            ws.isAlive = false;
            // logger.info(`Sending ping to client ${ws.userId || 'unknown'}`);
            ws.ping((err) => {
                if (err) {
                    logger.error(`Error sending ping to client ${ws.userId}: ${err.message}`);
                }
            });
        });
    }, 20000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    return wss;
};

module.exports = createWebSocketServer;
