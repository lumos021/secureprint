const WebSocket = require('ws');
const logger = require('./utils/logger');
const wsAuthMiddleware = require('./middleware/wsAuthMiddleware.js');

const createWebSocketServer = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', wsAuthMiddleware);

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
};

module.exports = createWebSocketServer;