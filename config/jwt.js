const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-jwt-kuat';

const generateJwtToken = (userId, authStatus) => {
  return jwt.sign(
    {
      userId,
      googleAuth: authStatus.googleAuth || false,
      trelloAuth: authStatus.trelloAuth || false,
      googleTokens: authStatus.googleTokens,
      trelloToken: authStatus.trelloToken,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

module.exports = {
  JWT_SECRET,
  generateJwtToken,
};