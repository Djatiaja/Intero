const express = require('express');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const jwt = require('jsonwebtoken');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-jwt-kuat';

// Configure OAuth2 client for Google
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000/auth/google/callback"
);

// Trello configuration
const TRELLO_API_KEY = process.env.TRELLO_API_KEY;

// Set up middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up session for storing tokens
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Generate JWT token function
const generateJwtToken = (userId, authStatus, googleTokens = null, trelloToken = null) => {
  return jwt.sign(
    {
      userId,
      googleAuth: authStatus.googleAuth || false,
      trelloAuth: authStatus.trelloAuth || false,
      googleTokens: authStatus.googleTokens,
      trelloToken: authStatus.trelloToken
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Generate partial tokens function
const generatePartialToken = (service, userId, tokens) => {
  return jwt.sign(
    {
      userId: userId,
      service: service,
      tokens: tokens
    },
    JWT_SECRET,
    { expiresIn: '1h' } // Short expiration for partial tokens
  );
};

// Middleware for verifying JWT
const verifyJwtToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Decoded JWT:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// API Catalog data
const apiCatalog = {
  version: '1.0.0',
  baseUrl: '/api',
  endpoints: [
    {
      path: '/auth/status',
      method: 'GET',
      description: 'Get current authentication status for Google and Trello',
      requiresAuth: false,
      parameters: [],
      responses: {
        '200': {
          description: 'Authentication status retrieved successfully',
          schema: {
            message: 'String',
            authStatus: {
              googleAuth: 'Boolean',
              trelloAuth: 'Boolean'
            }
          }
        }
      }
    },
    {
      path: '/auth/combine',
      method: 'GET',
      description: 'Combine Google and Trello tokens into a single JWT token',
      requiresAuth: false,
      parameters: [
        {
          name: 'googleToken',
          in: 'query',
          required: true,
          description: 'Partial token from Google authentication'
        },
        {
          name: 'trelloToken',
          in: 'query',
          required: true,
          description: 'Partial token from Trello authentication'
        }
      ],
      responses: {
        '200': {
          description: 'Tokens combined successfully, redirects to success page'
        },
        '400': {
          description: 'Invalid or missing tokens'
        }
      }
    },
    {
      path: '/trello/boards',
      method: 'GET',
      description: 'Get all Trello boards for the authenticated user',
      requiresAuth: true,
      authNeeded: ['trello'],
      parameters: [],
      responses: {
        '200': {
          description: 'List of Trello boards',
          schema: [
            {
              id: 'String',
              name: 'String'
            }
          ]
        },
        '401': {
          description: 'Not authenticated with Trello'
        }
      }
    },
    {
      path: '/trello/boards/:boardId/lists',
      method: 'GET',
      description: 'Get all lists within a Trello board',
      requiresAuth: true,
      authNeeded: ['trello'],
      parameters: [
        {
          name: 'boardId',
          in: 'path',
          required: true,
          description: 'ID of the Trello board'
        }
      ],
      responses: {
        '200': {
          description: 'List of Trello lists in the board',
          schema: [
            {
              id: 'String',
              name: 'String'
            }
          ]
        },
        '401': {
          description: 'Not authenticated with Trello'
        }
      }
    },
    {
      path: '/trello/boards/:boardId/cards',
      method: 'GET',
      description: 'Get all cards from a Trello board',
      requiresAuth: true,
      authNeeded: ['trello'],
      parameters: [
        {
          name: 'boardId',
          in: 'path',
          required: true,
          description: 'ID of the Trello board'
        }
      ],
      responses: {
        '200': {
          description: 'List of Trello cards in the board'
        },
        '401': {
          description: 'Not authenticated with Trello'
        }
      }
    },
    {
      path: '/sync/trello-to-calendar',
      method: 'POST',
      description: 'Sync Trello cards to Google Calendar events',
      requiresAuth: true,
      authNeeded: ['google', 'trello'],
      parameters: [
        {
          name: 'boardId',
          in: 'body',
          required: true,
          description: 'ID of the Trello board to sync'
        },
        {
          name: 'dueOnly',
          in: 'body',
          required: false,
          default: true,
          description: 'Only sync cards with due dates'
        }
      ],
      responses: {
        '200': {
          description: 'Sync completed successfully',
          schema: {
            message: 'String',
            totalCards: 'Number',
            results: 'Array'
          }
        },
        '401': {
          description: 'Not authenticated with Google or Trello'
        }
      }
    },
    {
      path: '/calendar/events',
      method: 'GET',
      description: 'Get upcoming Google Calendar events',
      requiresAuth: true,
      authNeeded: ['google'],
      parameters: [],
      responses: {
        '200': {
          description: 'List of Google Calendar events'
        },
        '401': {
          description: 'Not authenticated with Google'
        }
      }
    },
    {
      path: '/reauthenticate',
      method: 'GET',
      description: 'Check which services need reauthentication',
      requiresAuth: true,
      parameters: [],
      responses: {
        '200': {
          description: 'Authentication status and next steps',
          schema: {
            message: 'String',
            authUrl: 'String (optional)',
            status: {
              googleAuth: 'Boolean (optional)',
              trelloAuth: 'Boolean (optional)'
            }
          }
        },
        '401': {
          description: 'Invalid or missing JWT token'
        }
      }
    }
  ]
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Trello-Google Calendar Integration',
    googleAuthenticated: !!req.session.googleTokens,
    trelloAuthenticated: !!req.session.trelloToken,
    documentation: `${req.protocol}://${req.get('host')}/api/docs`,
  });
});

// Google Authentication route
app.get('/auth/google', (req, res) => {
  // Store userId if provided as query parameter
  if (req.query.userId) {
    req.session.userId = req.query.userId;
  }
  
  // Store Trello token if provided
  if (req.query.trelloToken) {
    req.session.trelloPartialToken = req.query.trelloToken;
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
  });
  console.log('Google Authorization URL:', url);
  res.redirect(url);
});

// Google OAuth callback route
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: 'Code not provided' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code.toString());
    oauth2Client.setCredentials(tokens);
    
    // Store tokens in session
    req.session.googleTokens = tokens;
    
    console.log('Google Authentication successful');
    
    // Generate partial token for Google auth
    const userId = req.session.userId || 'anonymous-user';
    const partialToken = generatePartialToken('google', userId, tokens);
    
      // If not authenticated with Trello, show partial token and link to Trello auth
      console.log('Google partial token:', partialToken);
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Successful</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .success-card { background-color: #f0f8ff; border: 1px solid #b0c4de; border-radius: 5px; padding: 20px; }
            .token-box { background-color: #f5f5f5; border: 1px solid #ddd; padding: 10px; margin: 15px 0; word-break: break-all; }
            .button { background-color: #4CAF50; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="success-card">
            <h1>Google Authentication Successful!</h1>
            <p>You have successfully authenticated with Google.</p>
            <h3>Your Google Partial Token:</h3>
            <div class="token-box">${partialToken}</div>
            <p>You need to authenticate with Trello next to complete the integration.</p>
          </div>
        </body>
        </html>
      `);
    }
  catch (error) {
    console.error('Error retrieving Google access token', error);
    res.status(500).json({ error: 'Failed to retrieve Google access token' });
  }
});

// Trello Authentication route
app.get('/auth/trello', (req, res) => {
  if (!TRELLO_API_KEY) {
    return res.status(500).json({ error: 'Trello API Key not configured' });
  }

  // Save the Google token if provided
  if (req.query.googleToken) {
    req.session.googlePartialToken = req.query.googleToken;
  }

  const callbackUrl = `${req.protocol}://${req.get('host')}/auth/trello/redirect`;
  const authUrl = `https://trello.com/1/authorize?expiration=never&name=Trello-Calendar-Integration&scope=read,write&response_type=token&key=${TRELLO_API_KEY}&return_url=${encodeURIComponent(callbackUrl)}`;
  
  res.redirect(authUrl);
});

app.get('/auth/trello/redirect', (req, res) => {
  // we need a simple page to extract it and send it to our backend
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
        // Extract the token from the URL fragment
        const fragment = window.location.hash.substring(1);
        const params = new URLSearchParams(fragment);
        const token = params.get('token');
        
        if (token) {
          // Send the token to our backend
          fetch('/auth/trello/save-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              // Redirect to success page with the JWT token
              window.location.href = '/auth-success?token=' +data.trelloToken;
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

// Trello token saving endpoint
app.post('/auth/trello/save-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token not provided' });
  }
  
  // Store token in session
  req.session.trelloToken = token;
  
  // Generate partial token for Trello
  const userId = req.session.userId || 'anonymous-user';
  const partialToken = generatePartialToken('trello', userId, token);
  
  // Check if we have a Google partial token
    res.json({ 
      success: true, 
      message: 'Trello token saved successfully',
      trelloToken: partialToken,
      // No Google token yet, so provide link to Google auth
      redirectUrl: `/auth/google?trelloToken=${partialToken}`
    });
});

// Combine tokens endpoint
app.get('/auth/combine', (req, res) => {
  const { googleToken, trelloToken } = req.query;
  
  if (!googleToken || !trelloToken) {
    return res.status(400).json({ error: 'Both Google and Trello tokens are required' });
  }
  
  try {
    // Verify both tokens
    const googleData = jwt.verify(googleToken, JWT_SECRET);
    const trelloData = jwt.verify(trelloToken, JWT_SECRET);
    
    // Check that both tokens are for the same user
    if (googleData.userId !== trelloData.userId) {
      return res.status(400).json({ error: 'Tokens belong to different users' });
    }
    
    // Store tokens in session for future use
    req.session.googleTokens = googleData.tokens;
    req.session.trelloToken = trelloData.tokens;
    
    // Create full auth status
    const authStatus = {
      googleAuth: true,
      trelloAuth: true,
      googleTokens: googleData.tokens,
      trelloToken: trelloData.tokens
    };
    
    // Generate combined JWT token
    const combinedToken = generateJwtToken(googleData.userId, authStatus);
    
    // Redirect to success page with the combined token
    res.redirect(`/auth-success?token=${combinedToken}`);
  } catch (error) {
    console.error('Error combining tokens:', error);
    res.status(400).json({ error: 'Invalid tokens provided' });
  }
});

// Success page showing the JWT token
app.get('/auth-success', (req, res) => {
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
          navigator.clipboard.writeText(tokenText).then(function() {
            alert('Token copied to clipboard!');
          }, function() {
            alert('Failed to copy token');
          });
        }
      </script>
    </body>
    </html>
  `);
});

// API Catalog endpoint
app.get('/api/catalog', (req, res) => {
  res.json(apiCatalog);
});

// API Documentation UI endpoint
app.get('/api/docs', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Documentation - Trello-Google Calendar Integration</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
        h1, h2, h3 { margin-top: 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        .endpoint { border: 1px solid #ddd; border-radius: 4px; margin-bottom: 20px; padding: 15px; background-color: #f9f9f9; }
        .method { display: inline-block; padding: 5px 10px; border-radius: 4px; font-weight: bold; margin-right: 10px; }
        .method.get { background-color: #61affe; color: white; }
        .method.post { background-color: #49cc90; color: white; }
        .method.put { background-color: #fca130; color: white; }
        .method.delete { background-color: #f93e3e; color: white; }
        .path { font-family: monospace; font-size: 1.1em; }
        .auth-badge { background-color: #e8f4fd; padding: 3px 8px; border-radius: 3px; font-size: 0.8em; margin-left: 10px; }
        .params-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .params-table th, .params-table td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
        .params-table th { background-color: #f2f2f2; }
        .response { margin-top: 10px; }
        .response-code { font-weight: bold; }
        pre { background-color: #f5f5f5; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .nav { background-color: #333; color: white; padding: 10px 0; }
        .nav ul { list-style-type: none; margin: 0; padding: 0; display: flex; justify-content: center; }
        .nav li { margin: 0 15px; }
        .nav a { color: white; text-decoration: none; }
        .auth-flow { margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="nav">
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/api/docs">API Documentation</a></li>
          <li><a href="/auth/google">Google Auth</a></li>
          <li><a href="/auth/trello">Trello Auth</a></li>
        </ul>
      </div>
      
      <div class="container">
        <h1>Trello-Google Calendar Integration API</h1>
        <p>Version: ${apiCatalog.version}</p>
        <p>Base URL: ${baseUrl}${apiCatalog.baseUrl}</p>
        
        <div class="auth-flow">
          <h2>Authentication Flow</h2>
          <p>Our API uses a two-step authentication process:</p>
          <ol>
            <li>Authenticate with Google and receive a partial token</li>
            <li>Authenticate with Trello and receive another partial token</li>
            <li>Combine both tokens to create a single JWT that grants access to all API endpoints</li>
          </ol>
          <p>You can start the authentication process from either <a href="/auth/google">Google</a> or <a href="/auth/trello">Trello</a>.</p>
        </div>
        
        <h2>Endpoints</h2>
        <div id="endpoints">
          ${apiCatalog.endpoints.map(endpoint => `
            <div class="endpoint">
              <div>
                <span class="method ${endpoint.method.toLowerCase()}">${endpoint.method}</span>
                <span class="path">${apiCatalog.baseUrl}${endpoint.path}</span>
                ${endpoint.requiresAuth ? `<span class="auth-badge">Requires Authentication: ${endpoint.authNeeded ? endpoint.authNeeded.join(', ') : 'JWT'}</span>` : ''}
              </div>
              <p>${endpoint.description}</p>
              
              ${endpoint.parameters.length > 0 ? `
                <h3>Parameters</h3>
                <table class="params-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Required</th>
                      <th>Description</th>
                      ${endpoint.parameters.some(p => p.default !== undefined) ? '<th>Default</th>' : ''}
                    </tr>
                  </thead>
                  <tbody>
                    ${endpoint.parameters.map(param => `
                      <tr>
                        <td>${param.name}</td>
                        <td>${param.in}</td>
                        <td>${param.required ? 'Yes' : 'No'}</td>
                        <td>${param.description}</td>
                        ${endpoint.parameters.some(p => p.default !== undefined) ? `<td>${param.default !== undefined ? param.default : '-'}</td>` : ''}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p>No parameters required</p>'}
              
              <h3>Responses</h3>
              ${Object.entries(endpoint.responses).map(([code, response]) => `
                <div class="response">
                  <span class="response-code">${code}:</span> ${response.description}
                  ${response.schema ? `
                    <pre>${JSON.stringify(response.schema, null, 2)}</pre>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `);
});

// Auth status endpoint
app.get('/api/auth/status', (req, res) => {
  const authStatus = {
    googleAuth: !!req.session.googleTokens,
    trelloAuth: !!req.session.trelloToken
  };

  res.json({
    message: 'Authentication status retrieved successfully',
    authStatus
  });
});

// Get Trello boards - protected with JWT
app.get('/api/trello/boards', async (req, res) => {

        if (!trelloToken) {
          return res.status(401).json({ error: 'Trello token not found' });
        }
        
        const response = await axios.get(`https://api.trello.com/1/members/me/boards`, {
            params: {
                key: TRELLO_API_KEY,
                token: trelloToken
            }
        });
        
        const boards = response.data.map(board => ({
            id: board.id,
            name: board.name
        }));
        
        res.json(boards);

});

// Get Trello lists within a board - protected with JWT
app.get('/api/trello/boards/:boardId/lists',  async (req, res) => {

    
        const { boardId } = req.params;
        const trelloToken = req.user.trelloToken || req.session.trelloToken;
        
        if (!trelloToken) {
          return res.status(401).json({ error: 'Trello token not found' });
        }
        
        const response = await axios.get(`https://api.trello.com/1/boards/${boardId}/lists`, {
            params: {
                key: TRELLO_API_KEY,
                token: trelloToken
            }
        });

        const lists = response.data.map(list => ({
            id: list.id,
            name: list.name
        }));

        res.json(lists);

});

// Get cards (tasks) from a specific board - protected with JWT
app.get('/api/trello/boards/:boardId/cards', verifyJwtToken, async (req, res) => {

    const { boardId } = req.params;
    const trelloToken = req.user.trelloToken || req.session.trelloToken;
    
    if (!trelloToken) {
      return res.status(401).json({ error: 'Trello token not found' });
    }
    
    const response = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken
      }
    });
    
    res.json(response.data);

});

// Create Google Calendar events from Trello cards - protected with JWT
app.post('/api/sync/trello-to-calendar', verifyJwtToken, async (req, res) => {
  // Check auth status in JWT
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Not authenticated with Trello' });
  }
  
  try {
    const { boardId, dueOnly = true } = req.body;
    
    if (!boardId) {
      return res.status(400).json({ error: 'Board ID is required' });
    }
    
    const googleTokens = req.user.googleTokens || req.session.googleTokens;
    const trelloToken = req.user.trelloToken || req.session.trelloToken;
    
    if (!googleTokens || !trelloToken) {
      return res.status(401).json({ error: 'Authentication tokens not found' });
    }
    
    oauth2Client.setCredentials(googleTokens);
    
    // 1. Get all cards from the board
    const cardsResponse = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken
      }
    });
    
    const cards = cardsResponse.data;
    
    // 2. Filter cards that have due dates if dueOnly is true
    const cardsToSync = dueOnly ? cards.filter(card => card.due) : cards;
    
    if (cardsToSync.length === 0) {
      return res.json({ message: 'No cards found to sync', count: 0 });
    }
    
    // 3. Create Google Calendar events for each card
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const syncResults = [];
    
    for (const card of cardsToSync) {
      try {
        // Calculate event duration (default to 1 hour if due date exists)
        let endTime = null;
        let startTime = null;
        
        if (card.due) {
          startTime = new Date(card.due);
          endTime = new Date(startTime);
          endTime.setHours(endTime.getHours() + 1); // Default duration: 1 hour
        } else {
          // For cards without due date, create an all-day event for tomorrow
          startTime = new Date();
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(0, 0, 0, 0);
          
          endTime = new Date(startTime);
          endTime.setDate(endTime.getDate() + 1);
        }
        
        // Create event object
        const event = {
          summary: card.name,
          description: `${card.desc}\n\nTrello Card: ${card.url}`,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: 'UTC'
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: 'UTC'
          },
          source: {
            title: 'Trello',
            url: card.url
          },
          extendedProperties: {
            private: {
              trelloCardId: card.id,
              trelloBoardId: boardId
            }
          }
        };
        
        // Insert event to Google Calendar
        const calendarResponse = await calendar.events.insert({
          calendarId: 'primary',
          resource: event
        });
        
        syncResults.push({
          trelloCard: card.name,
          googleEventId: calendarResponse.data.id,
          success: true
        });
      } catch (eventError) {
        console.error(`Error creating event for card ${card.id}:`, eventError);
        syncResults.push({
          trelloCard: card.name,
          error: eventError.message,
          success: false
        });
      }
    }
    
    res.json({
      message: 'Sync completed',
      totalCards: cardsToSync.length,
      results: syncResults
    });
    
  } catch (error) {
    console.error('Error syncing Trello cards to Google Calendar:', error);
    res.status(500).json({ error: 'Failed to sync Trello cards to Google Calendar' });
  }
});

// List Google Calendar events - protected with JWT
app.get('/api/calendar/events', verifyJwtToken, async (req, res) => {
  // Check auth status in JWT
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  
  try {
    const googleTokens = req.user.googleTokens || req.session.googleTokens;
    
    if (!googleTokens) {
      return res.status(401).json({ error: 'Google tokens not found' });
    }
    
    oauth2Client.setCredentials(googleTokens);
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch Calendar events' });
  }
});

// Reauthenticate route
app.get('/api/reauthenticate', verifyJwtToken, (req, res) => {
  // Check which services need reauthentication
  const needsGoogleAuth = !req.user.googleAuth;
  const needsTrelloAuth = !req.user.trelloAuth;
  
  if (needsGoogleAuth) {
    res.json({
      message: 'Google authentication required',
      authUrl: '/auth/google' 
    });
  } else if (needsTrelloAuth) {
    res.json({
      message: 'Trello authentication required',
      authUrl: '/auth/trello'
    });
  } else {
    res.json({
      message: 'All services authenticated',
      status: {
        googleAuth: true,
        trelloAuth: true
      }
    });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.redirect('/');
  });
});

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Route for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});