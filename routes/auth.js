const express = require('express');
const axios = require('axios');
const oauth2Client = require('../config/google');
const { TRELLO_API_KEY } = require('../config/trello');
const { generateJwtToken, JWT_SECRET } = require('../config/jwt');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Google Authentication
router.get('/auth/google', (req, res) => {
  console.log('Accessing /auth/google');
  if (!oauth2Client || typeof oauth2Client.generateAuthUrl !== 'function') {
    console.error('oauth2Client is invalid or generateAuthUrl is not a function');
    return res.status(500).json({ error: 'Google OAuth client is not properly initialized' });
  }

  if (req.query.userId) req.session.userId = req.query.userId;

  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });
    console.log('Google Authorization URL:', url);
    res.redirect(url);
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({ error: 'Failed to generate Google authorization URL' });
  }
});

// Google OAuth Callback
router.get('/auth/google/callback', async (req, res) => {
  console.log('Accessing /auth/google/callback');
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Code not provided' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code.toString());
    oauth2Client.setCredentials(tokens);
    req.session.googleTokens = tokens;

    console.log('Google Authentication successful, tokens:', tokens);

    // Redirect to Trello authentication
    res.redirect('/auth/trello');
  } catch (error) {
    console.error('Error retrieving Google access token:', error);
    res.status(500).json({ error: 'Failed to retrieve Google access token' });
  }
});

// Trello Authentication
router.get('/auth/trello', (req, res) => {
  console.log('Accessing /auth/trello');
  if (!TRELLO_API_KEY) {
    return res.status(500).json({ error: 'Trello API Key not configured' });
  }

  const callbackUrl = `${req.protocol}://${req.get('host')}/auth/trello/redirect`;
  const authUrl = `https://trello.com/1/authorize?expiration=never&name=Trello-Calendar-Integration&scope=read,write&response_type=token&key=${TRELLO_API_KEY}&return_url=${encodeURIComponent(callbackUrl)}`;
  res.redirect(authUrl);
});

// Trello Redirect Handler
router.get('/auth/trello/redirect', (req, res) => {
  console.log('Accessing /auth/trello/redirect');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Processing Trello Authorization</title>
    </head>
    <body>
      <h1>Processing Trello Authorization...</h1>
      <p>Please wait while we complete the authorization process.</p>
      <script>
        const fragment = window.location.hash.substring(1);
        const params = new URLSearchParams(fragment);
        const token = params.get('token');
        if (token) {
          fetch('/auth/trello/save-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              window.location.href = '/auth-success?token=' + data.jwtToken;
            } else {
              document.body.innerHTML += '<p>Error: ' + data.error + '</p>';
            }
          })
          .catch(error => {
            document.body.innerHTML += '<p>Error: ' + error.message + '</p>';
          });
        } else {
          document.body.innerHTML += '<p>Error: No token received from Trello</p>';
        }
      </script>
    </body>
    </html>
  `);
});

// Trello Token Saving Endpoint
router.post('/auth/trello/save-token', (req, res) => {
  console.log('Accessing /auth/trello/save-token');
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token not provided' });
  }

  if (!req.session.googleTokens) {
    return res.status(400).json({ success: false, error: 'Google authentication required first' });
  }

  req.session.trelloToken = token;
  const userId = req.session.userId || 'anonymous-user';

  // Generate final JWT with both tokens
  const authStatus = {
    googleAuth: true,
    trelloAuth: true,
    googleTokens: req.session.googleTokens,
    trelloToken: token,
  };

  const jwtToken = generateJwtToken(userId, authStatus);

  res.json({
    success: true,
    message: 'Trello token saved successfully',
    jwtToken,
  });
});

// Success Page
router.get('/auth-success', (req, res) => {
  console.log('Accessing /auth-success');
  const token = req.query.token || '';
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authentication Successful</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .success-card { background-color: #f0f8ff; border: 1px solid #b0c4de; border-radius: 5px; padding: 20px; }
        .token-box { background-color: #f5f5f5; border: 1px solid #ddd; padding: 10px; margin: 15px 0; word-break: break-all; }
        .button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; }
        .info { background-color: #e8f4fd; padding: 10px; border-left: 4px solid #2196F3; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="success-card">
        <h1>Authentication Successful!</h1>
        <p>You have successfully authenticated with both Google and Trello.</p>
        <h3>Your JWT Access Token:</h3>
        <div class="token-box">${token}</div>
        <p>Please save this token securely. You will need it for API requests.</p>
        <button class="button" onclick="copyToken()">Copy Token</button>
        <div class="info">
          <p><strong>How to use this token:</strong></p>
          <p>Include it in the Authorization header of your API requests:</p>
          <pre>Authorization: Bearer ${token}</pre>
          <p>For more information, check the <a href="/api/docs">API Documentation</a>.</p>
        </div>
      </div>
      <script>
        function copyToken() {
          const tokenText = '${token}';
          navigator.clipboard.writeText(tokenText).then(() => {
            alert('Token copied to clipboard!');
          }, () => {
            alert('Failed to copy token');
          });
        }
      </script>
    </body>
    </html>
  `);
});

// Logout
router.get('/logout', (req, res) => {
  console.log('Accessing /logout');
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.redirect('/');
  });
});

module.exports = router;