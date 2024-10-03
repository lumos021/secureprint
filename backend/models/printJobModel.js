const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  jobId: { type: String, unique: true, required: true },
  sessionId: { type: String, required: true },
  userId: { type: String, required: true },
  fileId: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'printing', 'completed', 'failed'],
    default: 'pending'
  },
  pageCount: { type: Number, required: true },
  colorMode: { type: String, enum: ['color', 'b&w'], required: true },
  orientation: { type: String, enum: ['portrait', 'landscape'], required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PrintJob', printJobSchema);