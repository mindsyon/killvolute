/* =========================================================
   server/index.js  —  Express bootstrap
   ========================================================= */

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

require('./db'); // initializes the DB at import time
const { attachUser } = require('./auth');

const authRoutes          = require('./routes/auth');
const threadRoutes        = require('./routes/threads');
const announcementRoutes  = require('./routes/announcements');
const userRoutes          = require('./routes/users');
const adminRoutes         = require('./routes/admin');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/* ----- Core middleware ----- */
app.use(express.json({ limit: '128kb' }));
app.use(cookieParser());

/* ----- Tiny rate limiter (per-IP, sliding window, in-memory) ----- */
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = 120; // 120 req/min per IP
const ipHits = new Map(); // ip -> [timestamps]
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const arr = ipHits.get(ip) || [];
  const recent = arr.filter(t => now - t < RL_WINDOW_MS);
  recent.push(now);
  ipHits.set(ip, recent);
  if (recent.length > RL_MAX) {
    return res.status(429).json({ error: 'Too many requests. Slow down.' });
  }
  next();
});

/* ----- Per-request user attachment ----- */
app.use(attachUser);

/* ----- API routes ----- */
app.use('/api', authRoutes);
app.use('/api', threadRoutes);
app.use('/api', announcementRoutes);
app.use('/api', userRoutes);
app.use('/api', adminRoutes);

/* ----- Health ----- */
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ----- 404 for unknown API routes ----- */
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

/* ----- Static frontend ----- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

/* ----- SPA fallback ----- */
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ----- Error handler ----- */
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n  KillVolute listening on http://localhost:${PORT}\n`);
});
