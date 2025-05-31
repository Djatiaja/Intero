// middleware/auth.js (assumed)
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

const verifyJwtToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Should set req.user to the decoded JWT payload
    next();
  } catch (error) {
    console.error('JWT verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = verifyJwtToken;