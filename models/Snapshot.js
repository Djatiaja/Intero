const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  boardId: { type: String, required: true },
  calendarEvents: [{ id: String, title: String, start: String, lastModified: Date }],
  trelloCards: [{ id: String, title: String, due: String, idList: String, lastModified: Date }],
  lastSync: { type: Date, default: Date.now },
});

snapshotSchema.index({ userId: 1, boardId: 1 });

module.exports = mongoose.model('Snapshot', snapshotSchema);