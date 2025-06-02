const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const verifyJwtToken = require('../middleware/auth');
const oauth2Client = require('../config/google');
const { TRELLO_API_KEY } = require('../config/trello');
const User = require('../models/User');
const SyncLog = require('../models/SyncLog');
const Snapshot = require('../models/Snapshot');

const router = express.Router();

// Helper function untuk retry dengan backoff
async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
  const { setTimeout } = require('timers/promises');
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        await setTimeout(delay * Math.pow(2, i));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Batas retry tercapai');
}

// Helper function untuk refresh token Google
async function refreshGoogleToken(googleTokens) {
  try {
    oauth2Client.setCredentials(googleTokens);
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  } catch (error) {
    console.error('Error refreshing Google token:', error.message);
    throw new Error('Gagal refresh token Google');
  }
}

// Middleware untuk memvalidasi token
async function validateTokens(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'JWT tidak valid atau hilang' });
  }

  if (req.user.googleAuth && req.user.googleTokens) {
    const now = Date.now();
    if (req.user.googleTokens.expiry_date <= now) {
      try {
        const newTokens = await refreshGoogleToken(req.user.googleTokens);
        req.user.googleTokens = newTokens;
        await User.updateOne(
          { _id: req.user._id },
          { googleTokens: newTokens }
        );
        console.log('Token Google berhasil di-refresh');
      } catch (error) {
        return res.status(401).json({ error: error.message });
      }
    }
  }

  next();
}

// Endpoint: Aktifkan/Nonaktifkan Sinkronisasi Board
router.post('/sync/boards', verifyJwtToken, validateTokens, async (req, res) => {
  const { boards, enable } = req.body;
  if (!Array.isArray(boards) || typeof enable !== 'boolean') {
    return res.status(400).json({ error: 'Array boards dan boolean enable diperlukan' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user.trelloAuth || !user.trelloToken) {
      return res.status(401).json({ error: 'Tidak terautentikasi dengan Trello' });
    }

    for (const { boardId, listId } of boards) {
      try {
        await retryWithBackoff(() =>
          axios.get(`https://api.trello.com/1/boards/${boardId}`, {
            params: { key: TRELLO_API_KEY, token: user.trelloToken },
          })
        );
        await retryWithBackoff(() =>
          axios.get(`https://api.trello.com/1/lists/${listId}`, {
            params: { key: TRELLO_API_KEY, token: user.trelloToken },
          })
        );
      } catch (error) {
        return res.status(400).json({ error: `boardId ${boardId} atau listId ${listId} tidak valid` });
      }
    }

    if (enable) {
      const existingBoards = user.syncBoards || [];
      const updatedBoards = [...existingBoards];
      for (const { boardId, listId } of boards) {
        const index = updatedBoards.findIndex((b) => b.boardId === boardId);
        if (index >= 0) {
          updatedBoards[index].listId = listId;
        } else {
          updatedBoards.push({ boardId, listId });
        }
      }
      await User.updateOne(
        { _id: req.user._id },
        { syncBoards: updatedBoards, syncEnabled: true }
      );
      res.json({ message: 'Sinkronisasi diaktifkan untuk board yang ditentukan', boards: updatedBoards });
    } else {
      const remainingBoards = user.syncBoards.filter(
        (b) => !boards.some((input) => input.boardId === b.boardId)
      );
      await User.updateOne(
        { _id: req.user._id },
        { syncBoards: remainingBoards, syncEnabled: remainingBoards.length > 0 }
      );
      res.json({ message: 'Sinkronisasi dinonaktifkan untuk board yang ditentukan', boards: remainingBoards });
    }
  } catch (error) {
    console.error('Error memperbarui pengaturan sinkronisasi:', error.message);
    res.status(500).json({ error: 'Gagal memperbarui pengaturan sinkronisasi', details: error.message });
  }
});

// Ambil Board Trello
router.get('/trello/boards', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Trello' });
  }

  const trelloToken = req.user.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Token Trello tidak ditemukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get('https://api.trello.com/1/members/me/boards', {
        params: { key: TRELLO_API_KEY, token: trelloToken },
      })
    );
    const boards = response.data.map((board) => ({
      id: board.id,
      name: board.name,
    }));
    res.json(boards);
  } catch (error) {
    console.error('Error mengambil board Trello:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengambil board Trello',
      details: error.response?.data || error.message,
    });
  }
});

// Ambil List di Board Trello
router.get('/trello/boards/:boardId/lists', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Trello' });
  }

  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Token Trello tidak ditemukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`https://api.trello.com/1/boards/${boardId}/lists`, {
        params: { key: TRELLO_API_KEY, token: trelloToken },
      })
    );
    const lists = response.data.map((list) => ({
      id: list.id,
      name: list.name,
    }));
    res.json(lists);
  } catch (error) {
    console.error('Error mengambil list Trello:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengambil list Trello',
      details: error.response?.data || error.message,
    });
  }
});

// Ambil Kartu di Board Trello
router.get('/trello/boards/:boardId/cards', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.trelloAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Trello' });
  }

  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken;
  if (!trelloToken) {
    return res.status(401).json({ error: 'Token Trello tidak ditemukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
        params: { key: TRELLO_API_KEY, token: trelloToken },
      })
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error mengambil kartu Trello:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengambil kartu Trello',
      details: error.response?.data || error.message,
    });
  }
});

// Ambil Board Spesifik
router.get('/trello/boards/:boardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken;

  if (!trelloToken) {
    return res.status(401).json({ error: 'Token Trello tidak ditemukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`https://api.trello.com/1/boards/${boardId}`, {
        params: { key: TRELLO_API_KEY, token: trelloToken },
      })
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error mengambil board:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengambil board',
      details: error.response?.data || error.message,
    });
  }
});

// Buat Board
router.post('/trello/boards', verifyJwtToken, validateTokens, async (req, res) => {
  const { name, desc, defaultLists } = req.body;
  const trelloToken = req.user.trelloToken;

  if (!name) {
    return res.status(400).json({ error: 'Nama board diperlukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.post('https://api.trello.com/1/boards/', null, {
        params: {
          key: TRELLO_API_KEY,
          token: trelloToken,
          name,
          desc: desc || '',
          defaultLists: defaultLists === false ? false : true,
        },
      })
    );
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error membuat board:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal membuat board',
      details: error.response?.data || error.message,
    });
  }
});

// Arsipkan Board
router.put('/trello/boards/:boardId/archive', verifyJwtToken, validateTokens, async (req, res) => {
  const { boardId } = req.params;
  const trelloToken = req.user.trelloToken;

  if (!boardId) {
    return res.status(400).json({ error: 'ID board diperlukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.put(`https://api.trello.com/1/boards/${boardId}/closed`, null, {
        params: {
          key: TRELLO_API_KEY,
          token: trelloToken,
          value: true,
        },
      })
    );
    await User.updateOne(
      { _id: req.user._id },
      { $pull: { syncBoards: { boardId } } }
    );
    res.json({ message: 'Board berhasil diarsipkan', data: response.data });
  } catch (error) {
    console.error('Error mengarsipkan board:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengarsipkan board',
      details: error.response?.data || error.message,
    });
  }
});

// Ambil Kartu Spesifik
router.get('/trello/cards/:cardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { cardId } = req.params;
  const trelloToken = req.user.trelloToken;

  if (!trelloToken) {
    return res.status(401).json({ error: 'Token Trello tidak ditemukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.get(`https://api.trello.com/1/cards/${cardId}`, {
        params: { key: TRELLO_API_KEY, token: trelloToken },
      })
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error mengambil kartu:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengambil kartu',
      details: error.response?.data || error.message,
    });
  }
});

// Tambah Kartu
router.post('/trello/cards', verifyJwtToken, validateTokens, async (req, res) => {
  const { name, desc, idList } = req.body;
  const trelloToken = req.user.trelloToken;

  if (!name || !idList) {
    return res.status(400).json({ error: 'Nama dan idList diperlukan' });
  }

  try {
    const response = await retryWithBackoff(() =>
      axios.post(`https://api.trello.com/1/cards`, null, {
        params: {
          key: TRELLO_API_KEY,
          token: trelloToken,
          name,
          desc,
          idList,
        },
      })
    );
    res.status(201).json(response.data);
  } catch (error) {
    console.error('Error membuat kartu:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal membuat kartu',
      details: error.response?.data || error.message,
    });
  }
});

// Perbarui Kartu
router.put('/trello/cards/:cardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { cardId } = req.params;
  const { name, desc, idList } = req.body;
  const trelloToken = req.user.trelloToken;

  try {
    const response = await retryWithBackoff(() =>
      axios.put(`https://api.trello.com/1/cards/${cardId}`, null, {
        params: {
          key: TRELLO_API_KEY,
          token: trelloToken,
          name,
          desc,
          idList,
        },
      })
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error memperbarui kartu:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal memperbarui kartu',
      details: error.response?.data || error.message,
    });
  }
});

// Hapus Kartu
router.delete('/trello/cards/:cardId', verifyJwtToken, validateTokens, async (req, res) => {
  const { cardId } = req.params;
  const trelloToken = req.user.trelloToken;

  try {
    await retryWithBackoff(() =>
      axios.delete(`https://api.trello.com/1/cards/${cardId}`, {
        params: { key: TRELLO_API_KEY, token: trelloToken },
      })
    );
    res.json({ success: true, message: 'Kartu berhasil dihapus' });
  } catch (error) {
    console.error('Error menghapus kartu:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal menghapus kartu',
      details: error.response?.data || error.message,
    });
  }
});

// Ambil Event Google Calendar
async function getCalendarEvents(googleTokens) {
  oauth2Client.setCredentials(googleTokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await retryWithBackoff(() =>
    calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    })
  );
  return response.data.items.map((event) => ({
    id: event.id,
    title: event.summary,
    start: event.start.dateTime || event.start.date,
    trelloCardId: event.extendedProperties?.private?.trelloCardId,
    boardId: event.extendedProperties?.private?.trelloBoardId,
  }));
}

// Ambil Kartu Trello
async function getTrelloCards(boardId, trelloToken) {
  const response = await retryWithBackoff(() =>
    axios.get(`https://api.trello.com/1/boards/${boardId}/cards`, {
      params: { key: TRELLO_API_KEY, token: trelloToken },
    })
  );
  return response.data.map((card) => ({
    id: card.id,
    title: card.name,
    due: card.due,
    idList: card.idList,
    idBoard: card.idBoard,
  }));
}

// Sinkronkan Trello ke Google Calendar
async function syncTrelloToCalendar(userId, trelloCards, calendarEvents, googleTokens) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client.setCredentials(googleTokens) });
  const syncResults = [];

  for (const card of trelloCards) {
    const existingEvent = calendarEvents.find((event) => event.trelloCardId === card.id && event.boardId === card.idBoard);
    const snapshot = await Snapshot.findOne({ userId, boardId: card.idBoard }) || { calendarEvents: [], trelloCards: [] };
    const snapshotCard = snapshot.trelloCards.find((sc) => sc.id === card.id);

    if (!existingEvent) {
      const startTime = card.due ? new Date(card.due) : new Date();
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 1);

      const event = {
        summary: card.title,
        description: `Trello card: ${card.url}`,
        start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
        end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
        source: { title: 'Trello', url: card.url },
        extendedProperties: {
          private: { trelloCardId: card.id, trelloBoardId: card.idBoard },
        },
      };

      const response = await retryWithBackoff(() =>
        calendar.events.insert({
          calendarId: 'primary',
          resource: event,
        })
      );

      await SyncLog.create({
        userId,
        type: 'trello_to_calendar',
        action: 'created',
        details: { cardId: card.id, eventId: response.data.id, title: card.title, boardId: card.idBoard },
      });

      syncResults.push({ cardId: card.id, action: 'created_event', success: true });
    } else if (
      snapshotCard &&
      (snapshotCard.title !== card.title || snapshotCard.due !== card.due || snapshotCard.idList !== card.idList)
    ) {
      await retryWithBackoff(() =>
        calendar.events.patch({
          calendarId: 'primary',
          eventId: existingEvent.id,
          resource: {
            summary: card.title,
            start: { dateTime: card.due || existingEvent.start },
            end: { dateTime: new Date(new Date(card.due || existingEvent.start).getTime() + 3600000).toISOString() },
          },
        })
      );
      await SyncLog.create({
        userId,
        type: 'trello_to_calendar',
        action: 'updated',
        details: { cardId: card.id, eventId: existingEvent.id, title: card.title, boardId: card.idBoard },
      });
      syncResults.push({ cardId: card.id, action: 'updated_event', success: true });
    }
  }

  for (const event of calendarEvents.filter((e) => e.trelloCardId && e.boardId)) {
    if (!trelloCards.some((card) => card.id === event.trelloCardId && card.idBoard === event.boardId)) {
      await retryWithBackoff(() =>
        calendar.events.delete({
          calendarId: 'primary',
          eventId: event.id,
        })
      );

      await SyncLog.create({
        userId,
        type: 'trello_to_calendar',
        action: 'deleted',
        details: { eventId: event.id, title: event.title, boardId: event.boardId },
      });

      syncResults.push({ eventId: event.id, action: 'deleted_event', success: true });
    }
  }

  return syncResults;
}

// Sinkronkan Google Calendar ke Trello
async function syncCalendarToTrello(userId, calendarEvents, trelloCards, trelloToken, boardId, listId) {
  const syncResults = [];

  for (const event of calendarEvents) {
    const existingCard = trelloCards.find((card) => card.id === event.trelloCardId && card.idBoard === event.boardId);
    const snapshot = await Snapshot.findOne({ userId, boardId }) || { calendarEvents: [], trelloCards: [] };
    const snapshotEvent = snapshot.calendarEvents.find((se) => se.id === event.id);

    if (!existingCard && !event.trelloCardId) {
      const response = await retryWithBackoff(() =>
        axios.post(`https://api.trello.com/1/cards`, null, {
          params: {
            key: TRELLO_API_KEY,
            token: trelloToken,
            name: event.title,
            due: event.start,
            idList: listId,
          },
        })
      );

      await retryWithBackoff(() =>
        google.calendar({ version: 'v3', auth: oauth2Client }).events.patch({
          calendarId: 'primary',
          eventId: event.id,
          resource: {
            extendedProperties: {
              private: { trelloCardId: response.data.id, trelloBoardId: boardId },
            },
          },
        })
      );

      await SyncLog.create({
        userId,
        type: 'calendar_to_trello',
        action: 'created',
        details: { eventId: event.id, cardId: response.data.id, title: event.title, boardId },
      });

      syncResults.push({ eventId: event.id, action: 'created_card', success: true });
    } else if (
      existingCard &&
      snapshotEvent &&
      (snapshotEvent.title !== event.title || snapshotEvent.start !== event.start)
    ) {
      await retryWithBackoff(() =>
        axios.put(`https://api.trello.com/1/cards/${existingCard.id}`, null, {
          params: {
            key: TRELLO_API_KEY,
            token: trelloToken,
            name: event.title,
            due: event.start,
            idList: listId,
          },
        })
      );
      await SyncLog.create({
        userId,
        type: 'calendar_to_trello',
        action: 'updated',
        details: { eventId: event.id, cardId: existingCard.id, title: event.title, boardId },
      });
      syncResults.push({ eventId: event.id, action: 'updated_card', success: true });
    }
  }

  for (const card of trelloCards) {
    if (!calendarEvents.some((event) => event.trelloCardId === card.id && event.boardId === card.idBoard)) {
      await retryWithBackoff(() =>
        axios.delete(`https://api.trello.com/1/cards/${card.id}`, {
          params: { key: TRELLO_API_KEY, token: trelloToken },
        })
      );

      await SyncLog.create({
        userId,
        type: 'calendar_to_trello',
        action: 'deleted',
        details: { cardId: card.id, title: card.title, boardId: card.idBoard },
      });

      syncResults.push({ cardId: card.id, action: 'deleted_card', success: true });
    }
  }

  return syncResults;
}

// Endpoint Sinkronisasi Manual
router.post('/sync', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth || !req.user.trelloAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Google atau Trello' });
  }

  const { boardId, listId } = req.body;
  if (!boardId || !listId) {
    return res.status(400).json({ error: 'ID board dan ID list diperlukan' });
  }

  try {
    const googleTokens = req.user.googleTokens;
    const trelloToken = req.user.trelloToken;

    const calendarEvents = await getCalendarEvents(googleTokens);
    const trelloCards = await getTrelloCards(boardId, trelloToken);

    let snapshot = await Snapshot.findOne({ userId: req.user._id, boardId }) || 
      new Snapshot({ userId: req.user._id, boardId, calendarEvents: [], trelloCards: [] });

    const trelloToCalendarResults = await syncTrelloToCalendar(
      req.user._id,
      trelloCards,
      calendarEvents,
      googleTokens
    );
    const calendarToTrelloResults = await syncCalendarToTrello(
      req.user._id,
      calendarEvents,
      trelloCards,
      trelloToken,
      boardId,
      listId
    );

    snapshot.calendarEvents = calendarEvents.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      lastModified: new Date(),
    }));
    snapshot.trelloCards = trelloCards.map((c) => ({
      id: c.id,
      title: c.title,
      due: c.due,
      idList: c.idList,
      lastModified: new Date(),
    }));
    snapshot.lastSync = new Date();
    await snapshot.save();

    res.json({
      message: 'Sinkronisasi selesai',
      trelloToCalendar: trelloToCalendarResults,
      calendarToTrello: calendarToTrelloResults,
    });
  } catch (error) {
    console.error('Error selama sinkronisasi:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal sinkronisasi',
      details: error.response?.data || error.message,
    });
  }
});

// Ambil Log Sinkronisasi
router.get('/sync/logs', verifyJwtToken, validateTokens, async (req, res) => {
  try {
    const logs = await SyncLog.find({ userId: req.user._id }).sort({ timestamp: -1 });
    res.json(logs);
  } catch (error) {
    console.error('Error mengambil log sinkronisasi:', error.message);
    res.status(500).json({ error: 'Gagal mengambil log sinkronisasi', details: error.message });
  }
});

// Endpoint Google Calendar
router.get('/calendar/events', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Google' });
  }

  try {
    const googleTokens = req.user.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Token Google tidak ditemukan' });
    }

    const events = await getCalendarEvents(googleTokens);
    res.json(events);
  } catch (error) {
    console.error('Error mengambil event Kalender:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal mengambil event Kalender',
      details: error.response?.data || error.message,
    });
  }
});

router.get('/calendar/events/:eventId', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Google' });
  }

  try {
    const googleTokens = req.user.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Token Google tidak ditemukan' });
    }

    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await retryWithBackoff(() =>
      calendar.events.get({
        calendarId: 'primary',
        eventId: req.params.eventId,
      })
    );
    res.json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      res.status(404).json({ error: 'Event tidak ditemukan' });
    } else {
      console.error('Error mengambil event Kalender:', error.response?.data || error.message);
      res.status(500).json({
        error: 'Gagal mengambil event Kalender',
        details: error.response?.data || error.message,
      });
    }
  }
});

// Endpoint untuk membuat event Google Calendar
router.post('/calendar/events', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Google' });
  }

  const { summary, start, end } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Field wajib (summary, start, end) hilang' });
  }

  try {
    const googleTokens = req.user.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Token Google tidak ditemukan' });
    }

    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await retryWithBackoff(() =>
      calendar.events.insert({
        calendarId: 'primary',
        resource: req.body,
      })
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error membuat event Kalender:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal membuat event Kalender',
      details: error.response?.data || error.message,
    });
  }
});

// Endpoint untuk memperbarui event Google Calendar
router.put('/calendar/events/:eventId', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Google' });
  }

  const { summary, start, end } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Field wajib (summary, start, end) hilang' });
  }

  try {
    const googleTokens = req.user.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Token Google tidak ditemukan' });
    }

    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await retryWithBackoff(() =>
      calendar.events.update({
        calendarId: 'primary',
        eventId: req.params.eventId,
        resource: req.body,
      })
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error memperbarui event Kalender:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal memperbarui event Kalender',
      details: error.response?.data || error.message,
    });
  }
});

// Endpoint untuk menghapus event Google Calendar
router.delete('/calendar/events/:eventId', verifyJwtToken, validateTokens, async (req, res) => {
  if (!req.user.googleAuth) {
    return res.status(401).json({ error: 'Tidak terautentikasi dengan Google' });
  }

  try {
    const googleTokens = req.user.googleTokens;
    if (!googleTokens) {
      return res.status(401).json({ error: 'Token Google tidak ditemukan' });
    }

    oauth2Client.setCredentials(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await retryWithBackoff(() =>
      calendar.events.delete({
        calendarId: 'primary',
        eventId: req.params.eventId,
      })
    );
    res.json({ message: 'Event berhasil dihapus' });
  } catch (error) {
    console.error('Error menghapus event Kalender:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Gagal menghapus event Kalender',
      details: error.response?.data || error.message,
    });
  }
});

// Endpoint untuk reautentikasi
router.get('/reauthenticate', verifyJwtToken, validateTokens, (req, res) => {
  const needsGoogleAuth = !req.user.googleAuth || !req.user.googleTokens;
  const needsTrelloAuth = !req.user.trelloAuth || !req.user.trelloToken;

  if (needsGoogleAuth) {
    res.json({ message: 'Autentikasi Google diperlukan', authUrl: '/auth/google' });
  } else if (needsTrelloAuth) {
    res.json({ message: 'Autentikasi Trello diperlukan', authUrl: '/auth/trello' });
  } else {
    res.json({
      message: 'Semua layanan terautentikasi',
      status: { googleAuth: true, trelloAuth: true },
    });
  }
});

module.exports = router;
module.exports.getTrelloCards = getTrelloCards;
module.exports.getCalendarEvents = getCalendarEvents;
module.exports.syncTrelloToCalendar = syncTrelloToCalendar;
module.exports.syncCalendarToTrello = syncCalendarToTrello;