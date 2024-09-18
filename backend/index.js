const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const https = require('https');
const logger = require('./utils/logger');
const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const fileRoutes = require('./routes/fileRoutes');
const createWebSocketServer = require('./wsServer.js');

dotenv.config();

const PORT = process.env.PORT || 8080; // Cloud Run typically uses port 8080
const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
};

app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', shopRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
})
.then(() => logger.info('MongoDB connected with connection pooling'))
.catch(e => logger.error('MongoDB connection error:', e));

// Create HTTPS server
const server = https.createServer(app);

// Create WebSocket server
const wss = createWebSocketServer(server);

// Update fileRoutes to use wss
app.use('/api/files', fileRoutes(wss));

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});