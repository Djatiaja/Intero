require('dotenv').config();
const express = require("express");
const app = express.Router();
const { google } = require("googleapis");
const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const TRELLO_API_KEY = process.env.TRELLO_API_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const calendar = google.calendar({ version: "v3", auth: oauth2Client });

app.use(express.json());

// ===== Google Calendar Routes =====

app.get("/events", async (req, res) => {
  try {
    const calendarId = req.query.calendarId || "primary";
    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });
    res.json(response.data.items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/events/:eventId", async (req, res) => {
  try {
    const response = await calendar.events.get({
      calendarId: "primary",
      eventId: req.params.eventId,
    });
    res.json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      res.status(404).json({ error: "Event tidak ditemukan" });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.post("/events", async (req, res) => {
  const { summary, start, end } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: "Field wajib (summary, start, end) tidak lengkap" });
  }
  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: req.body,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/events/:eventId", async (req, res) => {
  const { summary, start, end } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: "Field wajib (summary, start, end) tidak lengkap" });
  }
  try {
    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: req.params.eventId,
      resource: req.body,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/events/:eventId", async (req, res) => {
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId: req.params.eventId,
    });
    res.json({ message: "Event berhasil dihapus" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Trello API Routes =====

// Helper function to build Trello API URL with auth query
const trelloUrl = (endpoint) => {
  return `https://api.trello.com/1${endpoint}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`;
};

// GET ALL CARDS for a list or board (query parameter: listId or boardId)
// Prefer listId if provided, otherwise boardId
app.get("/trello/cards", async (req, res) => {
  try {
    const { listId, boardId } = req.query;
    let url;

    if (listId) {
      url = trelloUrl(`/lists/${listId}/cards`);
    } else if (boardId) {
      url = trelloUrl(`/boards/${boardId}/cards`);
    } else {
      return res.status(400).json({ error: "Harap sertakan listId atau boardId sebagai query parameter" });
    }

    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// GET CARD by cardId
app.get("/trello/cards/:cardId", async (req, res) => {
  try {
    const { cardId } = req.params;
    const url = trelloUrl(`/cards/${cardId}`);
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// INSERT CARD (create card)
// Expected body: { name, desc, pos, idList } minimal required: name, idList
app.post("/trello/cards", async (req, res) => {
  try {
    const { name, desc = "", pos = "bottom", idList } = req.body;
    if (!name || !idList) {
      return res.status(400).json({ error: "Field wajib (name, idList) tidak lengkap" });
    }

    const url = trelloUrl(`/cards`);
    const response = await axios.post(url, null, {
      params: { name, desc, pos, idList }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// UPDATE CARD
// Expected body can contain any card fields to update, e.g., name, desc, pos, idList, etc.
app.put("/trello/cards/:cardId", async (req, res) => {
  try {
    const { cardId } = req.params;
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "Tidak ada data yang dikirim untuk update" });
    }

    const url = trelloUrl(`/cards/${cardId}`);
    const response = await axios.put(url, null, { params: req.body });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// DELETE CARD
app.delete("/trello/cards/:cardId", async (req, res) => {
  try {
    const { cardId } = req.params;
    const url = trelloUrl(`/cards/${cardId}`);
    await axios.delete(url);
    res.json({ message: "Card berhasil dihapus" });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

module.exports = app;
