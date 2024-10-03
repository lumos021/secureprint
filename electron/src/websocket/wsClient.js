const WebSocket = require('ws');
const config = require('../utils/config');
const logger = require('../utils/logger');
const authManager = require('../auth/authManager');
const printQueue = require('../printer/printQueue');
const printerManager = require('../printer/printerManager')

class WSClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.isConnecting = false;
        this.mainWindow = null;  // Placeholder for mainWindow
        this.printQueue = null;
        this.printJobs = new Map();

    }

    setMainWindow(mainWindow) {
        this.mainWindow = mainWindow;
        this.printQueue = new printQueue(mainWindow);
        this.setupPrintQueueListeners();  
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
                headers: { Authorization: `Bearer ${authState.token}` }
            });

            this.ws.on('open', this.onOpen.bind(this));
            this.ws.on('message', this.onMessage.bind(this));
            this.ws.on('close', this.onClose.bind(this));
            this.ws.on('error', this.onError.bind(this));
        } catch (error) {
            logger.error(`Error during WebSocket connection: ${error.message}`, this.mainWindow);
            this.isConnecting = false;
            this.reconnect();
        }
    }

    onOpen() {
        logger.info('Connected to WebSocket server', this.mainWindow);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectInterval = 1000; // Reset reconnect interval
        this.sendInitialState();
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
                });
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

    sendPrinterStatus() {
        const status = {
            printers: this.printQueue.getPrinterStatus(),
            queueStatus: this.printQueue.getQueueStatus()
        };
        this.sendMessage({ type: 'printer-status', data: status });
    }

    cancelPrintJob(jobId) {
        this.printQueue.cancelJob(jobId);
    }

    onClose(code, reason) {
        logger.warn(`Disconnected from WebSocket server. Code: ${code}, Reason: ${reason}`, this.mainWindow);
        this.isConnecting = false;
        this.reconnect();
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
        setTimeout(() => this.connect(), delay);
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
                printerStatus: printerStatus,
                queueStatus: this.printQueue.getQueueStatus()
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
        clearTimeout(this.reconnectTimeout); // Clear any reconnect attempts
        this.close();
    }

}

module.exports = new WSClient();