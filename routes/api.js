const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const verifyJwtToken = require('../middleware/auth');
const oauth2Client = require('../config/google');
const { TRELLO_API_KEY } = require('../config/trello');

const router = express.Router();

// Helper function to refresh Google access token
async function refreshGoogleToken(googleTokens) {
  try {
    oauth2Client.setCredentials(googleTokens);
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  } catch (error) {
    console.error('Error refreshing Google token:', error.message);
    throw new Error('Failed to refresh Google access token');
  }
}

// Middleware to validate tokens and refresh if needed
async function validateTokens(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Invalid or missing JWT' });
  }

  if (req.user.googleAuth && req.user.googleTokens) {
    const now = Date.now();
    if (req.user.googleTokens.expiry_date <= now) {
      try {
        const newTokens = await refreshGoogleToken(req.user.googleTokens);
        req.user.googleTokens = newTokens; // Update tokens in req.user
        console.log('Google token refreshed successfully');
      } catch (error) {
        return res.status(401).json({ error: error.message });
      }
    }
  }

  next();
}

// Get Trello Boards
router.get('/trello/boards', verifyJwtToken, validateTokens, async (req, res) => {
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
    console.error('Error fetching Trello boards:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Trello boards', 
      details: error.response?.data || error.message 
    });
  }
});

// Get Trello Lists in a Board
router.get('/trello/boards/:boardId/lists', verifyJwtToken, validateTokens, async (req, res) => {
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
    console.error('Error fetching Trello lists:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Trello lists', 
      details: error.response?.data || error.message 
    });
  }
});

// Get Trello Cards in a Board
router.get('/trello/boards/:boardId/cards', verifyJwtToken, validateTokens, async (req, res) => {
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
    console.error('Error fetching Trello cards:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Trello cards', 
      details: error.response?.data || error.message 
    });
  }
});

// Get Specific Board (GET BOARD)
router.get('/trello/boards/:boardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  if (!trelloToken) {
    return res.status(401).json({ error: 'Trello token not found' });
  }

  try {
    const response = await axios.get(`https://api.trello.com/1/boards/${boardId}`, {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching board:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch board', details: error.response?.data || error.message });
  }
});

// Create Board (POST)
router.post('/trello/boards', verifyJwtToken, validateTokens, async (req, res) => {
  const { name, desc, defaultLists } = req.body;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  if (!name) {
    return res.status(400).json({ error: 'Board name is required' });
  }

  try {
    const response = await axios.post('https://api.trello.com/1/boards/', null, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken,
        name,
        desc: desc || '',
        defaultLists: defaultLists === false ? false : true, // default true
      },
    });
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating board:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create board', details: error.response?.data || error.message });
  }
});

// Archive (Delete) Board (PUT)
router.put('/trello/boards/:boardId/archive', verifyJwtToken, validateTokens, async (req, res) => {
  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  if (!boardId) {
    return res.status(400).json({ error: 'Board ID is required' });
  }

  try {
    // Set board closed = true (archive)
    const response = await axios.put(`https://api.trello.com/1/boards/${boardId}/closed`, null, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken,
        value: true,
      },
    });
    res.json({ message: 'Board archived successfully', data: response.data });
  } catch (error) {
    console.error('Error archiving board:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to archive board', details: error.response?.data || error.message });
  }
});

// Get Specific Card (GET CARD)
router.get('/trello/cards/:cardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { cardId } = req.params;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  if (!trelloToken) {
    return res.status(401).json({ error: 'Trello token not found' });
  }

  try {
    const response = await axios.get(`https://api.trello.com/1/cards/${cardId}`, {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching card:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch card', details: error.response?.data || error.message });
  }
});

//Insert Card (POST)
router.post('/trello/cards', verifyJwtToken, validateTokens, async (req, res) => {
  const { name, desc, idList } = req.body;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  if (!name || !idList) {
    return res.status(400).json({ error: 'Name and idList are required' });
  }

  try {
    const response = await axios.post(`https://api.trello.com/1/cards`, null, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken,
        name,
        desc,
        idList,
      },
    });
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error creating card:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create card', details: error.response?.data || error.message });
  }
});

//Update Card (PUT)
router.put('/trello/cards/:cardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { cardId } = req.params;
  const { name, desc, idList } = req.body;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  try {
    const response = await axios.put(`https://api.trello.com/1/cards/${cardId}`, null, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken,
        name,
        desc,
        idList,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error updating card:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update card', details: error.response?.data || error.message });
  }
});

//Delete Card (DELETE)
router.delete('/trello/cards/:cardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { cardId } = req.params;
  const trelloToken = req.user.trelloToken || req.session.trelloToken;

  try {
    await axios.delete(`https://api.trello.com/1/cards/${cardId}`, {
      params: {
        key: TRELLO_API_KEY,
        token: trelloToken,
      },
    });
    res.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    console.error('Error deleting card:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete card', details: error.response?.data || error.message });
  }
});


// Sync Trello Cards to Google Calendar
router.post('/sync/trello-to-calendar', verifyJwtToken, validateTokens, async (req, res) => {
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
          description: `${card.desc || ''}\n\nTrello Card: ${card.url}`,
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
        console.error(`Error creating event for card ${card.id}:`, eventError.message);
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
    console.error('Error syncing Trello cards to Google Calendar:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to sync Trello cards to Google Calendar', 
      details: error.response?.data || error.message 
    });
  }
});

// Updated List Google Calendar Events
router.get('/calendar/events', verifyJwtToken, validateTokens, async (req, res) => {
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
    const calendarId = req.query.calendarId || 'primary';
    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json(response.data.items);
  } catch (error) {
    console.error('Error fetching Calendar events:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Calendar events', 
      details: error.response?.data || error.message 
    });
  }
});

// Get Specific Google Calendar Event
router.get('/calendar/events/:eventId', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  try {
    const googleTokens = req.user.googleTokens || req.session.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Google tokens not found' });
    }

    const calendarId = req.query.calendarId || 'primary';
    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.get({
      calendarId,
      eventId: req.params.eventId,
    });
    res.json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      res.status(404).json({ error: 'Event not found' });
    } else {
      console.error('Error fetching Calendar event:', error.response?.data || error.message);
      res.status(500).json({ 
        error: 'Failed to fetch Calendar event', 
        details: error.response?.data || error.message 
      });
    }
  }
});

// Insert Google Calendar Event
router.post('/calendar/events', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  const { summary, start, end } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Required fields (summary, start, end) are missing' });
  }

  try {
    const googleTokens = req.user.googleTokens || req.session.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Google tokens not found' });
    }

    const calendarId = req.query.calendarId || 'primary';
    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.insert({
      calendarId,
      resource: req.body,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error creating Calendar event:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create Calendar event', 
      details: error.response?.data || error.message 
    });
  }
});

// Update Google Calendar Event
router.put('/calendar/events/:eventId', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  const { summary, start, end } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Required fields (summary, start, end) are missing' });
  }

  try {
    const googleTokens = req.user.googleTokens || req.session.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Google tokens not found' });
    }

    const calendarId = req.query.calendarId || 'primary';
    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.update({
      calendarId,
      eventId: req.params.eventId,
      resource: req.body,
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error updating Calendar event:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to update Calendar event', 
      details: error.response?.data || error.message 
    });
  }
});

// Delete Google Calendar Event
router.delete('/calendar/events/:eventId', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }

  try {
    const googleTokens = req.user.googleTokens || req.session.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Google tokens not found' });
    }

    const calendarId = req.query.calendarId || 'primary';
    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({
      calendarId,
      eventId: req.params.eventId,
    });
    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting Calendar event:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to delete Calendar event', 
      details: error.response?.data || error.message 
    });
  }
});

// Reauthenticate
router.get('/reauthenticate', verifyJwtToken, validateTokens, (req, res) => {
  const needsGoogleAuth = !req.user.googleAuth || !req.user.googleTokens;
  const needsTrelloAuth = !req.user.trelloAuth || !req.user.trelloToken;

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