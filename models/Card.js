// models/Card.js
const mongoose = require('mongoose');
const CardSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  title: { type: String, required: true },
  description: String,
  status: { type: String, default: 'todo' },
  position: { type: Number, default: 0 },
  dueDate: Date,
  priority: String,
  labels: [String],
  updatedAt: Date,
});
module.exports = mongoose.model('Card', CardSchema);