const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const http = require('http');
const logger = require('./utils/logger');
const authRoutes = require('./routes/authRoutes');
const shopRoutes = require('./routes/shopRoutes');
const fileRoutes = require('./routes/fileRoutes');
const createWebSocketServer = require('./wsServer.js');

dotenv.config();

const PORT = process.env.PORT || 8080;
// const WS_PORT = process.env.WS_PORT || 5553;
const app = express();
// Create HTTP server (not HTTPS)
const server = http.createServer(app);

// Create WebSocket server
const wss = createWebSocketServer(server);



const corsOptions = {
  origin: process.env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'], // Add 'x-session-id'
};

app.set('trust proxy', 1);
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes(wss));
app.use('/api', shopRoutes);


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  maxIdleTimeMS:60000,
  keepAlive: true,
  keepAliveInitialDelay: 300000, 
})
.then(() => logger.info('MongoDB connected with connection pooling'))
.catch(e => logger.error('MongoDB connection error:', e));


server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});


wss.on('listening', () => {
  logger.info(`WebSocket Server is running on port ${PORT}`);
});