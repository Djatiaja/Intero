const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const User = require('../models/User');
const oauth2Client = require('../config/google');

// Debug environment variables specific to auth.js
console.log('auth.js environment variables:', {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  TRELLO_API_KEY: process.env.TRELLO_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET
});

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      password: hashedPassword,
      syncBoards: [],
      syncEnabled: false,
      googleAuth: false,
      trelloAuth: false
    });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: 'Registration failed', details: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined');
      return res.status(500).json({ error: 'Server configuration error', details: 'Missing JWT_SECRET' });
    }
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Google OAuth
router.get('/auth/google', (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      console.error('Google OAuth configuration missing:', {
        GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI
      });
      return res.status(500).json({
        error: 'Google OAuth configuration error',
        details: 'Missing client ID, client secret, or redirect URI'
      });
    }
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar'],
      prompt: 'consent'
    });
    res.json({ authUrl });
  } catch (error) {
    console.error('Google Auth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate Google auth URL', details: error.message });
  }
});

router.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    // Verify JWT token
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Invalid or missing Authorization header' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Missing JWT token' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined in auth/google/callback');
      return res.status(500).json({ error: 'Server configuration error', details: 'Missing JWT_SECRET' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Exchange code for tokens
    let tokens;
    try {
      const { tokens: retrievedTokens } = await oauth2Client.getToken(code);
      tokens = retrievedTokens;
    } catch (tokenError) {
      console.error('Error exchanging code for tokens:', tokenError);
      return res.status(400).json({
        error: 'Failed to exchange authorization code',
        details: tokenError.message,
      });
    }

    // Set credentials and validate token
    oauth2Client.setCredentials(tokens);
    const oauth2 = require('googleapis').google.oauth2({ version: 'v2', auth: oauth2Client });
    let userInfo;
    try {
      const { data } = await oauth2.userinfo.get();
      userInfo = data;
    } catch (userInfoError) {
      console.error('Error fetching user info:', userInfoError);
      return res.status(401).json({
        error: 'Failed to validate Google token',
        details: userInfoError.message,
      });
    }

    // Update user with Google tokens
    await User.updateOne(
      { _id: decoded.id },
      {
        googleAuth: true,
        googleTokens: {
          ...tokens,
          expiry_date: tokens.expiry_date || Date.now() + (tokens.expires_in * 1000),
        },
      }
    );

    res.redirect('/api/auth/success');
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({
      error: 'Google authentication failed',
      details: error.response?.data?.error_description || error.message,
    });
  }
});

// Trello Auth
router.post('/auth/trello', async (req, res) => {
  const { trelloToken } = req.body;
  if (!trelloToken) {
    return res.status(400).json({ error: 'Missing Trello token' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing JWT token' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined in auth/trello');
      return res.status(500).json({ error: 'Server configuration error', details: 'Missing JWT_SECRET' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate Trello token
    if (!process.env.TRELLO_API_KEY) {
      console.error('TRELLO_API_KEY is not defined');
      return res.status(500).json({ error: 'Server configuration error', details: 'Missing TRELLO_API_KEY' });
    }

    try {
      const response = await axios.get('https://api.trello.com/1/members/me', {
        params: {
          key: process.env.TRELLO_API_KEY,
          token: trelloToken
        }
      });

      if (!response.data.id) {
        return res.status(400).json({ error: 'Invalid Trello token' });
      }

      await User.updateOne(
        { _id: decoded.id },
        { trelloAuth: true, trelloToken }
      );
      console.log('Trello Auth - User updated successfully for user:', decoded.email);
      res.json({ message: 'Trello authentication successful' });
    } catch (trelloError) {
      console.error('Trello token validation error:', trelloError.response?.data || trelloError.message);
      return res.status(400).json({
        error: 'Invalid Trello token',
        details: trelloError.response?.data || trelloError.message
      });
    }
  } catch (error) {
    console.error('Trello auth error:', error);
    res.status(500).json({ error: 'Trello authentication failed', details: error.message });
  }
});

router.get('/auth/success', (req, res) => {
  res.json({ message: 'Authentication successful' });
});

module.exports = router;