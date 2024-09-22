// backen/utils/clientManager.js
const EventEmitter = require('events');
const logger = require('../utils/logger');

class ClientManager extends EventEmitter {
    constructor() {
        super();
        this.clients = new Map();
    }

    addClient(ws, userId) {
        this.clients.set(userId, { ws, authenticated: false });
        this.emit('clientAdded', userId);
        // logger.info('Client added to ClientManager', { userId: decoded.userId });
    }

    removeClient(userId) {
        this.clients.delete(userId);
        this.emit('clientRemoved', userId);
        logger.info('Client removed', { userId });
    }

    authenticateClient(userId) {
        const client = this.clients.get(userId);
        if (client) {
            client.authenticated = true;
            this.emit('clientAuthenticated', userId);
            logger.info('Client authenticated', { userId });
        }
    }

    isClientAuthenticated(userId) {
        const client = this.clients.get(userId);
        const isAuthenticated = client ? client.authenticated : false;
        logger.info('Checking client authentication status', { userId, isAuthenticated, clientExists: !!client });
        return isAuthenticated;
    }

    getAuthenticatedClients() {
        const authenticatedClients = Array.from(this.clients.entries())
            .filter(([_, client]) => client.authenticated)
            .map(([userId, client]) => ({ userId, ws: client.ws }));
        logger.info('Getting authenticated clients', { 
            authenticatedCount: authenticatedClients.length,
            totalClients: this.clients.size,
            clientIds: authenticatedClients.map(client => client.userId)
        });
        return authenticatedClients;
    }

    getClient(userId) {
        return this.clients.get(userId);
    }
}

module.exports = new ClientManager();