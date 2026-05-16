/* =========================================================
   server/routes/users.js
   ========================================================= */

const express = require('express');
const router = express.Router();

const { db, leaderboard, reputationFor } = require('../db');

/* GET /api/leaderboard */
router.get('/leaderboard', (_req, res) => {
  const rows = leaderboard(100);
  // attach rank
  const ranks = db.prepare(`SELECT id, rank FROM users`).all();
  const m = Object.fromEntries(ranks.map(r => [r.id, r.rank]));
  res.json({
    users: rows.map(u => ({ ...u, rank: m[u.id] || 'member' })),
  });
});

/* GET /api/users/:name */
router.get('/users/:name', (req, res) => {
  const name = String(req.params.name || '').toLowerCase();
  const user = db.prepare(`SELECT id, name, rank, created_at FROM users WHERE name = ?`).get(name);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const threadCount = db.prepare(`SELECT COUNT(*) AS c FROM threads WHERE author_id = ?`).get(user.id).c;
  const replyCount  = db.prepare(`SELECT COUNT(*) AS c FROM replies WHERE author_id = ?`).get(user.id).c;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      rank: user.rank,
      createdAt: user.created_at,
      reputation: reputationFor(user.id),
      threadCount,
      replyCount,
    },
  });
});

/* GET /api/stats */
router.get('/stats', (_req, res) => {
  res.json({
    users:    db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c,
    threads:  db.prepare(`SELECT COUNT(*) AS c FROM threads`).get().c,
    replies:  db.prepare(`SELECT COUNT(*) AS c FROM replies`).get().c,
  });
});

module.exports = router;
