const WebSocket = require('ws');
const config = require('../utils/config');
const logger = require('../utils/logger');
const authManager = require('../auth/authManager');
const PrintQueue = require('../printer/printQueue');
const printerManager = require('../printer/printerManager')

class WSClient {
    constructor(printerManager) {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.isConnecting = false;
        this.mainWindow = null;
        this.printQueue = null;
        this.printJobs = new Map();
        this.printerManager = printerManager;
        this.heartbeatInterval = null;
        this.pingTimeout = null;
        this.heartbeatDelay = 15000;     // Send heartbeat every 15 seconds (reduced from 20)
        this.pingTimeoutDelay = 5000;    // Wait 5 seconds for pong response
        this.lastPongReceived = null; 

    }

    setMainWindow(mainWindow, printerManager) {
        this.mainWindow = mainWindow;
        this.printerManager = printerManager;
        this.printQueue = new PrintQueue(this.printerManager);
        this.setupPrintQueueListeners();
    }
    setupHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    
        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                try {
                    // Check for long-term pong absence
                    if (this.lastPongReceived && Date.now() - this.lastPongReceived > 30000) {
                        logger.warn('No pong received for 30 seconds, reconnecting...', this.mainWindow);
                        this.cleanup();
                        this.reconnect();
                        return;
                    }
    
                    logger.info('Sending heartbeat ping...', this.mainWindow);
                    this.ws.ping(() => {
                        if (this.pingTimeout) clearTimeout(this.pingTimeout);
                        
                        this.pingTimeout = setTimeout(() => {
                            logger.warn('⚠️ Ping timeout detected - no pong received', this.mainWindow);
                            this.cleanup();
                            this.reconnect();
                        }, this.pingTimeoutDelay);
                    });
    
                } catch (error) {
                    logger.error(`Error sending ping: ${error.message}`, this.mainWindow);
                    this.cleanup();
                    this.reconnect();
                }
            } else {
                logger.warn('Cannot send heartbeat - WebSocket not open', this.mainWindow);
                this.cleanup();
                this.reconnect();
            }
        }, this.heartbeatDelay);
    }
    
    

    async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;
    
        try {
            const authState = await authManager.checkAuthState();
            if (!authState.isAuthenticated) {
                logger.error('Not authenticated. Cannot connect to WebSocket.', this.mainWindow);
                this.isConnecting = false;
                return;
            }
    
            this.ws = new WebSocket(config.wsUrl, {
                headers: { 
                    Authorization: `Bearer ${authState.token}`,
                    'Connection': 'Upgrade',
                    'Upgrade': 'websocket'
                },
                handshakeTimeout: 10000,
                maxPayload: 50 * 1024 * 1024 
            });
    
            // Bind event listeners
            this.ws.on('open', this.onOpen.bind(this));
            this.ws.on('message', this.onMessage.bind(this));
            this.ws.on('close', this.onClose.bind(this));
            this.ws.on('error', this.onError.bind(this));
            
            // Single pong handler
            this.ws.on('pong', () => {
                this.lastPongReceived = Date.now();
                logger.info(`✓ Pong received from server at ${new Date().toISOString()}`, this.mainWindow);
                if (this.pingTimeout) {
                    clearTimeout(this.pingTimeout);
                    this.pingTimeout = null;
                }
            });
    
            // Single ping handler
            this.ws.on('ping', () => {
                logger.info('Ping received from server, sending pong', this.mainWindow);
                // try {
                //     this.ws.pong();
                // } catch (error) {
                //     logger.error(`Error sending pong: ${error.message}`, this.mainWindow);
                // }
            });
    
        } catch (error) {
            logger.error(`Error during WebSocket connection: ${error.message}`, this.mainWindow);
            this.isConnecting = false;
            this.reconnect();
        }
    }
    
    heartbeatReceived() {
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
    }

    onOpen() {
        logger.info('Connected to WebSocket server', this.mainWindow);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectInterval = 1000;
        this.setupHeartbeat();
        this.sendQueuedMessages();

        // Send authentication message
        setTimeout(() => {
            authManager.getUserId().then((clientId) => {
                this.sendMessage({
                    type: 'auth',
                    clientId: clientId,
                    authenticated: true
                });
            }).catch((error) => {
                logger.error('Failed to get userId for authentication:', error);
            });
        }, 2000);
    }

    onMessage(data) {
        try {
            console.log('Raw WebSocket message received:', data);

            if (data === undefined) {
                logger.error('Received undefined WebSocket message');
                return;
            }

            let message;
            if (typeof data === 'string') {
                message = JSON.parse(data);
            } else if (data instanceof Buffer) {
                message = JSON.parse(data.toString());
            } else {
                logger.error(`Received WebSocket message of unexpected type: ${typeof data}`);
                return;
            }

            console.log('Parsed message:', message);
            switch (message.type) {
                case 'auth':
                    this.handleAuthMessage(message);
                    break;
                case 'print':
                    // Check if message has the expected structure
                    if (message.jobId !== undefined && (message.chunk !== undefined || message.done)) {
                        this.handlePrintRequest(message);
                    } else {
                        logger.error('Received malformed print message', this.mainWindow);
                        console.log('Malformed message:', message); // Add this line for debugging
                    }
                    break;

                case 'get-printers':
                    this.sendPrinterStatus();
                    break;
                case 'cancel-job':
                    this.cancelPrintJob(message.data.jobId);
                    break;
                case 'error':
                    logger.error(`Server error: ${message.message}`, this.mainWindow);
                    break;
                default:
                    logger.warn(`Unknown message type: ${message.type}`, this.mainWindow);
            }
        } catch (error) {
            logger.error(`Error handling WebSocket message: ${error.message}`, this.mainWindow);
            console.error('Full error:', error);
        }
    }

    handleAuthMessage(message) {
        logger.info(`Auth message received: ${JSON.stringify(message)}`, this.mainWindow);
        if (message.authenticated) {
            logger.info('Authentication successful', this.mainWindow);
            this.sendPrinterStatus();
        } else {
            logger.error('Authentication failed', this.mainWindow);
            authManager.clearAuthState();
            this.close();
        }
    }

    handlePrintRequest(message) {
        if (!this.printQueue) {
            logger.error('PrintQueue not initialized', this.mainWindow);
            return;
        }

        const jobId = message.jobId;

        if (message.done) {
            if (this.printJobs.has(jobId)) {
                const job = this.printJobs.get(jobId);
                const pdfData = Buffer.concat(job.chunks);
                this.printQueue.addJob({
                    jobId: jobId,
                    pdfData: pdfData,
                    printerName: job.printSettings.printerName,
                    settings: job.printSettings,
                    priority: job.printSettings.priority || 'normal'
                }, this.printerManager);
                this.printJobs.delete(jobId);
                this.sendPrintJobUpdate(jobId, 'pending');
            } else {
                logger.error(`Received done message for unknown job ID: ${jobId}`);
            }
            return;
        }

        // Handle chunked data
        if (!this.printJobs.has(jobId)) {
            this.printJobs.set(jobId, {
                chunks: [],
                total: message.total,
                received: 0,
                printSettings: message.printSettings
            });
        }

        const job = this.printJobs.get(jobId);
        const chunk = Buffer.from(message.chunk, 'base64');
        job.chunks.push(chunk);
        job.received += chunk.length;

        if (job.received >= job.total) {
            logger.info(`Received all chunks for job ${jobId}`);
        }
    }
    setupPrintQueueListeners() {
        if (this.printQueue) {
            this.printQueue.on('jobStarted', (jobId) => {
                this.sendPrintJobUpdate(jobId, 'printing');
            });

            this.printQueue.on('jobFinished', (jobId, status) => {
                this.sendPrintJobUpdate(jobId, status);
            });
        } else {
            logger.warn('PrintQueue not initialized when setting up listeners');
        }
    }

    sendPrintJobUpdate(jobId, status) {
        const updateMessage = {
            type: 'print_job_update',
            data: {
                jobId: jobId,
                status: status
            }
        };
        this.sendMessage(updateMessage);
        logger.info(`Print job update sent: Job ${jobId} status changed to ${status}`);
    }

    async sendPrinterStatus() {
        const status = {
            printers: await this.printerManager.getPrinterStatus(),
            queueStatus: this.printQueue.getQueueStatus()
        };
        this.sendMessage({ type: 'printer-status', data: status });
    }

    cancelPrintJob(jobId) {
        this.printQueue.cancelJob(jobId);
    }

    onClose(code, reason) {
        logger.warn(`Disconnected from WebSocket server. Code: ${code}, Reason: ${reason}`, this.mainWindow);
        this.cleanup();
        this.reconnect();
    }
    cleanup() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.isConnecting = false;
        this.lastPongReceived = null;
        
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
            } catch (error) {
                logger.error(`Error removing WebSocket listeners: ${error.message}`, this.mainWindow);
            }
        }
    }

    onError(error) {
        logger.error(`WebSocket error: ${error.message}`, this.mainWindow);
        this.isConnecting = false;
    }

    reconnect() {
        if (this.reconnectAttempts >= config.maxRetries) {
            logger.error('Max reconnection attempts reached. Giving up.', this.mainWindow);
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 300000);
        this.reconnectAttempts++;

        logger.info(`Attempting to reconnect in ${delay}ms...`);
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const messageString = JSON.stringify(message);
            this.ws.send(messageString);
            logger.info(`WebSocket message sent: ${messageString}`, this.mainWindow);
        } else {
            this.messageQueue.push(message);
            logger.warn('WebSocket not connected. Message queued.', this.mainWindow);
            if (!this.isConnecting) {
                this.connect();
            }
        }
    }

    sendQueuedMessages() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
    }

    async sendInitialState() {
        const clientId = await authManager.getUserId();

        // Fetch the correct printer status from the printer manager
        const printerStatus = await printerManager.getPrinterStatus();

        const status = {
            type: 'initial_state',
            data: {
                clientId: clientId,
                // printerStatus: printerStatus,
                // queueStatus: this.printQueue.getQueueStatus()
            }
        };

        logger.info(`Initial state to be sent: ${JSON.stringify(status)}`);
        this.sendMessage(status);
    }



    sendStatus() {
        const status = {
            type: 'status_update',
            data: {
                printerStatus: this.printQueue.getPrinterStatus(),
                queueStatus: this.printQueue.getQueueStatus()
            }
        };
        this.sendMessage(status);
    }

    // Method to be called when the application is shutting down
    shutdown() {
        logger.info('Shutting down WebSocket client', this.mainWindow);
        this.cleanup();
        clearTimeout(this.reconnectTimeout);
        if (this.ws) {
            this.ws.close(1000, 'Client shutting down');
            this.ws = null;
        }
    }
}

module.exports = new WSClient();