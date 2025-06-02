const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now },
  type: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: Object, required: true },
});

syncLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('SyncLog', syncLogSchema);