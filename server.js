require('dotenv').config();
const express = require("express");
const app = express.Router(); //
const { google } = require("googleapis");
// const app = express();
// const port = 3000;


const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const calendar = google.calendar({ version: "v3", auth: oauth2Client });

// app.use(express.json());

// GET ALL EVENT
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

// GET EVENT
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

// INSERT EVENT
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

// UPDATE EVENT
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

// DELETE EVENT
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

// app.listen(port, () => console.log(`Server berjalan di port ${port}`));
module.exports = app; //