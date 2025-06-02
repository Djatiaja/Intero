const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token diperlukan' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key');
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Pengguna tidak ditemukan' });
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token tidak valid', details: error.message });
  }
};