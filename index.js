const express = require('express');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const Queue = require('bull');
const authRouter = require('./routes/auth');
const apiRouter = require('./routes/api');
const apiCatalog = require("./routes/catalog");
const listEndpoints = require('express-list-endpoints');
const { getTrelloCards, getCalendarEvents, syncTrelloToCalendar, syncCalendarToTrello } = require('./routes/api');

// Load models before routes
require('./models/User');
require('./models/SyncLog');
require('./models/Snapshot');

const app = express();
console.log('Environment variables:', {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  TRELLO_API_KEY: process.env.TRELLO_API_KEY,
  TRELLO_API_SECRET: process.env.TRELLO_API_SECRET,
  JWT_SECRET: process.env.JWT_SECRET
});
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' },
  })
);

// Koneksi ke MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/sync-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).catch(error => console.error('Koneksi MongoDB gagal:', error.message));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use("/api",authRouter);
app.use('/api', apiRouter);
app.use("/api", apiCatalog);


// Task Queue untuk Sinkronisasi
const syncQueue = new Queue('sync-queue', process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// Helper function untuk refresh token Google
async function ensureValidGoogleToken(user) {
  const { setTimeout } = require('timers/promises');
  const oauth2Client = require('./config/google');
  try {
    const now = Date.now();
    if (user.googleTokens.expiry_date <= now + 60 * 1000) {
      oauth2Client.setCredentials(user.googleTokens);
      const { credentials } = await oauth2Client.refreshAccessToken();
      const User = mongoose.model('User');
      await User.updateOne({ _id: user._id }, { googleTokens: credentials });
      return credentials;
    }
    return user.googleTokens;
  } catch (error) {
    console.error('Error refreshing Google token:', error.message);
    throw new Error('Failed to refresh Google access token');
  }
}

// Fungsi sinkronisasi untuk satu pengguna dan board
async function performSyncForUser(user, boardId, listId) {
  try {
    await new Promise(resolve => setTimeout(resolve, 100)); // Delay 100ms untuk menghindari rate limit
    const googleTokens = await ensureValidGoogleToken(user);
    const trelloToken = user.trelloToken;

    const calendarEvents = await getCalendarEvents(googleTokens);
    const trelloCards = await getTrelloCards(boardId, trelloToken);

    let snapshot = await mongoose.model('Snapshot').findOne({ userId: user._id, boardId }) || 
      new mongoose.model('Snapshot')({ userId: user._id, boardId, calendarEvents: [], trelloCards: [] });

    await syncTrelloToCalendar(user._id, trelloCards, calendarEvents, googleTokens);
    await syncCalendarToTrello(user._id, calendarEvents, trelloCards, trelloToken, boardId, listId);

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

    console.log(`Sinkronisasi selesai untuk pengguna ${user.email} pada board ${boardId}`);
  } catch (error) {
    console.error(`Sinkronisasi gagal untuk pengguna ${user.email} pada board ${boardId}:`, error.message);
  }
}

// Sinkronisasi latar belakang untuk semua pengguna dan board
async function backgroundSync() {
  try {
    const User = mongoose.model('User');
    const users = await User.find({
      googleAuth: true,
      trelloAuth: true,
      syncEnabled: true,
      syncBoards: { $exists: true, $ne: [] },
    });

    for (const user of users) {
      for (const { boardId, listId } of user.syncBoards) {
        await syncQueue.add(
          { userId: user._id, boardId, listId },
          { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
        );
      }
    }
  } catch (error) {
    console.error('Error dalam sinkronisasi latar belakang:', error.message);
  }
}

// Jalankan sinkronisasi latar belakang setiap 10 detik
setInterval(backgroundSync, 10 * 1000);

// Proses pekerjaan sinkronisasi
syncQueue.process(async (job) => {
  const { userId, boardId, listId } = job.data;
  const User = mongoose.model('User');
  const user = await User.findById(userId);
  if (!user) return;
  await performSyncForUser(user, boardId, listId);
});

// Debug route untuk daftar semua rute
app.get('/debug/routes', (req, res) => {
  const routes = listEndpoints(app).map((route) => ({
    path: route.path,
    methods: route.methods,
  }));
  res.json({
    message: 'Daftar semua rute yang terdaftar',
    routes,
  });
});

// Rute utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Penanganan error 404
app.use((req, res) => {
  res.status(404).json({ error: `Rute ${req.method} ${req.url} tidak ditemukan` });
});

// // Log rute saat startup
// console.log('Rute yang terdaftar:', listEndpoints(app));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
  backgroundSync(); // Jalankan sinkronisasi awal
});