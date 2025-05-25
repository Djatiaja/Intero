const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

const generateJwtToken = (userId, authStatus) => {
  return jwt.sign(
    {
      userId,
      googleAuth: authStatus.googleAuth,
      trelloAuth: authStatus.trelloAuth,
      googleTokens: authStatus.googleTokens,
      trelloToken: authStatus.trelloToken,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

module.exports = { generateJwtToken, JWT_SECRET };