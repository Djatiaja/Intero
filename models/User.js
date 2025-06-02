const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  googleAuth: { type: Boolean, default: false },
  googleTokens: { type: Object },
  trelloAuth: { type: Boolean, default: false },
  trelloToken: { type: String },
  syncBoards: [{ boardId: String, listId: String }],
  syncEnabled: { type: Boolean, default: false },
});

userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);