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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful - Trello-Google Calendar Integration</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50">
  <!-- Navigation -->
  <nav class="bg-white shadow-sm border-b">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex justify-center items-center h-16">
        <div class="flex space-x-8">
          <a href="/" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            Home
          </a>
          <a href="/api/docs" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            API Documentation
          </a>
          <a href="/auth/google" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            Google Auth
          </a>
          <a href="/auth/trello" class="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium">
            Trello Auth
          </a>
        </div>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <div class="max-w-4xl mx-auto px-4 py-12">
    <!-- Success Header -->
    <div class="text-center mb-12">
      <div class="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
      </div>
      <h1 class="text-4xl font-bold text-gray-900 mb-4">
        Authentication Successful!
      </h1>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        You have successfully authenticated with both Google and Trello.
      </p>
    </div>

    <!-- Token Section -->
    <div class="bg-white rounded-lg shadow-sm border p-8 mb-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-6 text-center">Your JWT Access Token</h2>
      <p class="text-gray-600 mb-6 text-center">
        Please save this token securely. You will need it for API requests.
      </p>
      
      <div class="bg-gray-50 rounded-lg p-4 mb-6">
        <div class="flex items-center justify-between">
          <code id="jwt-token" class="text-sm text-gray-800 break-all pr-4 font-mono">${token}</code>
          <button 
            onclick="copyToken()" 
            id="copy-btn"
            class="flex-shrink-0 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            <svg id="copy-icon" class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
            </svg>
            <span id="copy-text">Copy Token</span>
          </button>
        </div>
      </div>
      
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 overflow-x-scroll">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-blue-800">
              How to use this token:
            </h3>
            <div class="mt-2 text-sm text-blue-700 ">
              <p>Include it in the Authorization header of your API requests:</p>
              <div class="mt-2 bg-blue-100 rounded p-2 ">
                <code class="text-xs">Authorization: Bearer ${token}</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Next Steps -->
    <div class="bg-white rounded-lg shadow-sm border p-8">
      <h2 class="text-2xl font-semibold text-gray-900 mb-6">Next Steps</h2>
      
      <div class="space-y-6">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">
              1
            </div>
          </div>
          <div class="ml-4">
            <h3 class="text-lg font-medium text-gray-900">Save Your Token</h3>
            <p class="text-gray-600">Store the JWT token securely in your application or environment variables.</p>
          </div>
        </div>
        
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">
              2
            </div>
          </div>
          <div class="ml-4">
            <h3 class="text-lg font-medium text-gray-900">Explore the API</h3>
            <p class="text-gray-600">Check out the API documentation to see available endpoints and examples.</p>
          </div>
        </div>
        
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <div class="flex items-center justify-center w-8 h-8 bg-gray-900 text-white rounded-full text-sm font-semibold">
              3
            </div>
          </div>
          <div class="ml-4">
            <h3 class="text-lg font-medium text-gray-900">Start Integrating</h3>
            <p class="text-gray-600">Begin syncing your Trello cards with Google Calendar events.</p>
          </div>
        </div>
      </div>
      
      <div class="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <a href="/api/docs" class="inline-flex items-center justify-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
          </svg>
          View API Documentation
        </a>
        
        <a href="/" class="inline-flex items-center justify-center px-6 py-3 border border-gray-300 shadow-sm text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
          </svg>
          Back to Home
        </a>
      </div>
    </div>
  </div>

  <script>
    function copyToken() {
      const token = document.getElementById('jwt-token').textContent;
      const copyBtn = document.getElementById('copy-btn');
      const copyText = document.getElementById('copy-text');
      const copyIcon = document.getElementById('copy-icon');
      
      navigator.clipboard.writeText(token).then(function() {
        // Change button appearance
        copyText.textContent = 'Copied!';
        copyIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>';
        copyBtn.classList.remove('text-gray-700', 'bg-white', 'hover:bg-gray-50');
        copyBtn.classList.add('text-green-700', 'bg-green-50', 'hover:bg-green-100');
        
        // Reset after 2 seconds
        setTimeout(function() {
          copyText.textContent = 'Copy Token';
          copyIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>';
          copyBtn.classList.remove('text-green-700', 'bg-green-50', 'hover:bg-green-100');
          copyBtn.classList.add('text-gray-700', 'bg-white', 'hover:bg-gray-50');
        }, 2000);
      }).catch(function(err) {
        console.error('Could not copy text: ', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = token;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        copyText.textContent = 'Copied!';
        setTimeout(function() {
          copyText.textContent = 'Copy Token';
        }, 2000);
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