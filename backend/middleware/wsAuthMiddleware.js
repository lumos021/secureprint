// middleware/wsAuthMiddleware.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.js');
const User = require('../models/userModel.js');
const wsMessageHandler = require('../utils/wsMessageHandler.js');
const { updateShopStatus } = require('../utils/shopStatusCache.js');
const clientManager = require('../utils/clientManager.js');

module.exports = async (ws, req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid authorization header');
        ws.close(1008, 'Invalid authorization');
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ userId: decoded.userId });

        if (!user) {
            logger.warn('Unknown user attempted to connect', { userId: decoded.userId });
            ws.close(1008, 'Unknown user');
            return;
        }

        ws.userId = decoded.userId;
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        clientManager.addClient(ws, decoded.userId);
        updateShopStatus(ws.userId, 'online');
        logger.info('WebSocket user connected', { userId: decoded.userId });
        
logger.info('WebSocket connection attempt', { userId: decoded.userId });

        ws.on('message', (message) => wsMessageHandler(ws, message));

        ws.on('close', () => {
            clientManager.removeClient(ws.userId);
            updateShopStatus(ws.userId, 'offline');
            logger.info('WebSocket user disconnected', { userId: decoded.userId });
        });
    } catch (error) {
        logger.error('Error in WebSocket connection', { error: error.message });
        ws.close(1008, 'Authentication failed');
    }
};