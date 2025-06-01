// models/Board.js
const mongoose = require('mongoose');
const BoardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model('Board', BoardSchema);