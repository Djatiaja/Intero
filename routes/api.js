// routes/api.js
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const verifyJwtToken = require('../middleware/auth');
const oauth2Client = require('../config/google');
const { TRELLO_API_KEY } = require('../config/trello');

const router = express.Router();

// Get Trello Boards
router.get('/trello/boards', verifyJwtToken, async (req, res) => {
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Not authenticated with Trello' });
  }

  const trelloToken = req.user.trelloToken || req.session.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Trello token not found' });
  }

  try {
    const response = await axios.get('https://api.trello.com/1/members/me/boards', {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    });
    const boards = response.data.map((board) => ({
      id: board.id,
      name: board.name,
    }));
    res.json(boards);
  } catch (error) {
    console.error('Error fetching Trello boards:', error);
    res.status(500).json({ error: 'Failed to fetch Trello boards' });
  }
});

// Get Trello Lists in a Board
router.get('/trello/boards/:boardId/lists', verifyJwtToken, async (req, res) => {
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Not authenticated with Trello' });
  }

  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Trello token not found' });
  }

  try {
    const response = await axios.get(`https://api.trello.com/1/boards/${boardId}/lists`, {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    });
    const lists = response.data.map((list) => ({
      id: list.id,
      name: list.name,
    }));
    res.json(lists);
  } catch (error) {
    console.error('Error fetching Trello lists:', error);
    res.status(500).json({ error: 'Failed to fetch Trello lists' });
  }
});

// Get Trello Cards in a Board
router.get('/trello/boards/:boardId/cards', verifyJwtToken, async (req, res) => {
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Not authenticated with Trello' });
  }

  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Trello token not found' });
  }

  try {
    const response = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching Trello cards:', error);
    res.status(500).json({ error: 'Failed to fetch Trello cards' });
  }
});

// Sync Trello Cards to Google Calendar
router.post('/sync/trello-to-calendar', verifyJwtToken, async (req, res) => {
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
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Get Trello cards
    const cardsResponse = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    });
    const cards = cardsResponse.data;
    const cardsToSync = dueOnly ? cards.filter((card) => card.due) : cards;

    if (cardsToSync.length === 0) {
      return res.json({ message: 'No cards found to sync', count: 0 });
    }

    // Create Google Calendar events
    const syncResults = [];
    for (const card of cardsToSync) {
      try {
        let startTime, endTime;
        if (card.due) {
          startTime = new Date(card.due);
          endTime = new Date(startTime);
          endTime.setHours(endTime.getHours() + 1);
        } else {
          startTime = new Date();
          startTime.setDate(startTime.getDate() + 1);
          startTime.setHours(0, 0, 0, 0);
          endTime = new Date(startTime);
          endTime.setDate(endTime.getDate() + 1);
        }

        const event = {
          summary: card.name,
          description: `${card.desc}\n\nTrello Card: ${card.url}`,
          start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
          end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
          source: { title: 'Trello', url: card.url },
          extendedProperties: {
            private: { trelloCardId: card.id, trelloBoardId: boardId },
          },
        };

        const calendarResponse = await calendar.events.insert({
          calendarId: 'primary',
          resource: event,
        });

        syncResults.push({
          trelloCard: card.name,
          googleEventId: calendarResponse.data.id,
          success: true,
        });
      } catch (eventError) {
        console.error(`Error creating event for card ${card.id}:`, eventError);
        syncResults.push({
          trelloCard: card.name,
          error: eventError.message,
          success: false,
        });
      }
    }

    res.json({
      message: 'Sync completed',
      totalCards: cardsToSync.length,
      results: syncResults,
    });
  } catch (error) {
    console.error('Error syncing Trello cards to Google Calendar:', error);
    res.status(500).json({ error: 'Failed to sync Trello cards to Google Calendar' });
  }
});

// List Google Calendar Events
router.get('/calendar/events', verifyJwtToken, async (req, res) => {
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

// Reauthenticate
router.get('/reauthenticate', verifyJwtToken, (req, res) => {
  const needsGoogleAuth = !req.user.googleAuth;
  const needsTrelloAuth = !req.user.trelloAuth;

  if (needsGoogleAuth) {
    res.json({ message: 'Google authentication required', authUrl: '/auth/google' });
  } else if (needsTrelloAuth) {
    res.json({ message: 'Trello authentication required', authUrl: '/auth/trello' });
  } else {
    res.json({
      message: 'All services authenticated',
      status: { googleAuth: true, trelloAuth: true },
    });
  }
});

module.exports = router;