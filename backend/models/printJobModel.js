const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  jobId: { type: String, unique: true, required: true },
  sessionId: { type: String, required: true },
  shopId: { type: String, required: true },
  fileId: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'printing', 'completed', 'failed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PrintJob', printJobSchema);