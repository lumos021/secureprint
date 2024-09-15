// models/sessionModel.js
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, unique: true, required: true },
  userId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '1h' },
});

module.exports = mongoose.model('Session', sessionSchema);