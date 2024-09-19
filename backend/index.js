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


// MongoDB connection
const connectWithRetry = () => {
  mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    maxIdleTimeMS:60000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4
  })
  .then(() => {
    logger.info('MongoDB connected successfully');
  })
  .catch((err) => {
    logger.error('MongoDB connection unsuccessful, retry after 5 seconds.', err);
    setTimeout(connectWithRetry, 5000);
  });
};

connectWithRetry();

// Graceful shutdown
// Graceful shutdown
const gracefulShutdown = () => {
  mongoose.connection.close()
    .then(() => {
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Error while closing MongoDB connection', err);
      process.exit(1);
    });
};


// Listen for termination signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// mongoose.connect(process.env.MONGODB_URI, {
//   maxPoolSize: 10,
//   maxIdleTimeMS:60000,
//   serverSelectionTimeoutMS: 5000,
//   socketTimeoutMS: 45000,
//   family: 4
// })
// .then(() => logger.info('MongoDB connected with connection pooling'))
// .catch(e => logger.error('MongoDB connection error:', e));


server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});


wss.on('listening', () => {
  logger.info(`WebSocket Server is running on port ${PORT}`);
});