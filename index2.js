const express = require('express');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const jwt = require('jsonwebtoken'); // Tambahkan modul jwt

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia-jwt-kuat'; // Rahasia JWT untuk signing token

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

// Fungsi untuk menghasilkan JWT token
const generateJwtToken = (userId, authStatus, googleTokens = null, trelloToken = null) => {
  return jwt.sign(
    {
      userId,
      googleAuth: authStatus.googleAuth || false,
      trelloAuth: authStatus.trelloAuth || false,
      googleTokens:authStatus.googleTokens,
      trelloToken:authStatus.trelloToken
    },
    JWT_SECRET,
    { expiresIn: '30d' } // Token berlaku 30 hari
  );
};

// Middleware untuk verifikasi JWT
const verifyJwtToken = (req, res, next) => {
  // Ambil token dari header Authorization
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Middleware untuk memeriksa otentikasi Google (menggunakan token dari session)
const isGoogleAuthenticated = (req, res, next) => {
  const tokens = req.session.googleTokens;
  if (!tokens) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  
  oauth2Client.setCredentials(tokens);
  next();
};

// Middleware untuk memeriksa otentikasi Trello (menggunakan token dari session)
const isTrelloAuthenticated = (req, res, next) => {
  const trelloToken = req.session.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Not authenticated with Trello' });
  }
  
  req.trelloToken = trelloToken;
  next();
};

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Trello-Google Calendar Integration',
    googleAuthenticated: !!req.session.googleTokens,
    trelloAuthenticated: !!req.session.trelloToken
  });
});

// Google Authentication route
app.get('/auth/google', (req, res) => {
  // Simpan userId jika disediakan sebagai query parameter
  if (req.query.userId) {
    req.session.userId = req.query.userId;
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
    
    // Generate or update JWT token
    const userId = req.session.userId || 'anonymous-user';
    const authStatus = {
      googleAuth: true,
      trelloAuth: !!req.session.trelloToken,
      googleTokens: tokens
    };
    
    const token = generateJwtToken(userId, authStatus);
    
    if (authStatus.trelloAuth) {
      // Jika sudah otentikasi keduanya, redirect ke halaman sukses dengan token
      return res.redirect(`/auth-success?token=${token}`);
    } else {
      // Jika belum otentikasi Trello, redirect ke halaman otorisasi Trello
      return res.redirect(`/auth/trello?token=${token}`);
    }
  } catch (error) {
    console.error('Error retrieving Google access token', error);
    res.status(500).json({ error: 'Failed to retrieve Google access token' });
  }
});

// Trello Authentication route
app.get('/auth/trello', (req, res) => {
  if (!TRELLO_API_KEY) {
    return res.status(500).json({ error: 'Trello API Key not configured' });
  }

  // Simpan token sementara jika ada
  if (req.query.token) {
    req.session.tempJwtToken = req.query.token;
  }

  const callbackUrl = `${req.protocol}://${req.get('host')}/auth/trello/redirect`;
  const authUrl = `https://trello.com/1/authorize?expiration=never&name=Trello-Calendar-Integration&scope=read,write&response_type=token&key=${TRELLO_API_KEY}&return_url=${encodeURIComponent(callbackUrl)}`;
  
  res.redirect(authUrl);
});

// Halaman sukses yang menampilkan token JWT
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
              window.location.href = '/auth-success?token=' + encodeURIComponent(data.jwtToken);
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

app.post('/auth/trello/save-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token not provided' });
  }
  
  // Store token in session
  req.session.trelloToken = token;
  
  // Generate or update JWT token
  const userId = req.session.userId || 'anonymous-user';
  const authStatus = {
    googleAuth: !!req.session.googleTokens,
    trelloAuth: true,
    trelloToken: !!req.session.trelloToken,
  };
  
  const jwtToken = generateJwtToken(userId, authStatus);
  
  res.json({ 
    success: true, 
    message: 'Trello token saved successfully',
    jwtToken
  });
});

// API endpoint untuk mendapatkan status otentikasi dan JWT baru
app.get('/api/auth/status', (req, res) => {
  const authStatus = {
    googleAuth: !!req.session.googleTokens,
    trelloAuth: !!req.session.trelloToken,
    sessionData: req.session // Include all session data
  };

  res.json({
    message: 'Authentication status retrieved successfully',
    authStatus
  });
});



// Get Trello boards - dilindungi dengan JWT
app.get('/api/trello/boards', verifyJwtToken, async (req, res) => {
    // Periksa status otentikasi dalam JWT
    if (!req.user.trelloAuth) {
      return res.status(401).json({ error: 'Not authenticated with Trello. Please authenticate with Trello first.' });
    }
    
    try {
        const trelloToken = req.session.trelloToken;
        if (!trelloToken) {
          return res.status(401).json({ error: 'Trello token not found in session' });
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
    } catch (error) {
        console.error('Error fetching Trello boards:', error.message);
        res.status(500).json({ error: 'Failed to fetch Trello boards' });
    }
});

// Get Trello lists within a board - dilindungi dengan JWT
app.get('/api/trello/boards/:boardId/lists', verifyJwtToken, async (req, res) => {
    // Periksa status otentikasi dalam JWT
    if (!req.user.trelloAuth) {
      return res.status(401).json({ error: 'Not authenticated with Trello' });
    }
    
    try {
        const { boardId } = req.params;
        const trelloToken = req.session.trelloToken;
        
        if (!trelloToken) {
          return res.status(401).json({ error: 'Trello token not found in session' });
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
    } catch (error) {
        console.error('Error fetching Trello lists:', error.message);
        res.status(500).json({ error: 'Failed to fetch Trello lists' });
    }
});

// Get cards (tasks) from a specific board - dilindungi dengan JWT
app.get('/api/trello/boards/:boardId/cards', verifyJwtToken, async (req, res) => {
  // Periksa status otentikasi dalam JWT
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Not authenticated with Trello' });
  }
  
  try {
    const { boardId } = req.params;
    const trelloToken = req.session.trelloToken;
    
    if (!trelloToken) {
      return res.status(401).json({ error: 'Trello token not found in session' });
    }
    
    const response = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Trello cards:', error.message);
    res.status(500).json({ error: 'Failed to fetch Trello cards' });
  }
});

// Create Google Calendar events from Trello cards - dilindungi dengan JWT
app.post('/api/sync/trello-to-calendar', verifyJwtToken, async (req, res) => {
  // Periksa status otentikasi dalam JWT
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
    
    const googleTokens = req.session.googleTokens;
    const trelloToken = req.session.trelloToken;
    
    if (!googleTokens || !trelloToken) {
      return res.status(401).json({ error: 'Authentication tokens not found in session' });
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

// List Google Calendar events - dilindungi dengan JWT
app.get('/api/calendar/events', verifyJwtToken, async (req, res) => {
  // Periksa status otentikasi dalam JWT
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  
  try {
    const googleTokens = req.session.googleTokens;
    
    if (!googleTokens) {
      return res.status(401).json({ error: 'Google tokens not found in session' });
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

// Reauthenticate route - untuk pengguna yang sudah memiliki token tapi perlu diautentikasi ulang
app.get('/api/reauthenticate', verifyJwtToken, (req, res) => {
  // Cek layanan mana yang perlu diautentikasi ulang
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

// Sajikan file statis dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rute untuk root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});