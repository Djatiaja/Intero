const express = require('express');
const session = require('express-session');
const path = require('path');
const authRouter = require('./routes/auth');

const apiRouter = require('./routes/api');
const catalogRouter = require('./routes/catalog');
const listEndpoints = require('express-list-endpoints');

const app = express();

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

// Serve static files (e.g., index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use(authRouter);
app.use('/api', apiRouter);
app.use('/api', catalogRouter);

// Debug route to list all registered routes
app.get('/debug/routes', (req, res) => {
  const routes = [];

  // Iterate through the app's router stack
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).map((method) => method.toUpperCase()),
      });
    } else if (
      middleware.name === 'router' &&
      middleware.handle &&
      Array.isArray(middleware.handle.stack)
    ) {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods).map((method) => method.toUpperCase()),
          });
        }
      });
    }
  });

  res.json({
    message: 'List of all registered routes',
    routes,
  });
});

// Root route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling for 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});


// Log routes on startup
console.log('Registered routes:', listEndpoints(app));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});