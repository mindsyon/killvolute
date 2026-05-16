/* =========================================================
   server/routes/admin.js
   ========================================================= */

const express = require('express');
const router = express.Router();

const { db } = require('../db');
const { requireAuth } = require('../auth');
const { canPromoteOthers, canAssignRank, canModifyUser, rankFor, RANKS } = require('../ranks');

/* GET /api/staff  (public)  —  the staff page */
router.get('/staff', (_req, res) => {
  const staff = db.prepare(`
    SELECT id, name, rank, created_at FROM users
    WHERE rank != 'member'
  `).all();
  // sort by rank level desc, then by name
  staff.sort((a, b) => rankFor(b.rank).level - rankFor(a.rank).level || a.name.localeCompare(b.name));
  res.json({
    staff: staff.map(u => ({
      id: u.id, name: u.name, rank: u.rank, createdAt: u.created_at,
    })),
  });
});

/* GET /api/admin/users  (auth, mod+) — list users, optional search */
router.get('/admin/users', requireAuth, (req, res) => {
  if (!canPromoteOthers(req.user.rank)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const q = (req.query.q || '').toLowerCase();
  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT id, name, rank, created_at FROM users
      WHERE LOWER(name) LIKE ?
      ORDER BY name LIMIT 100
    `).all('%' + q + '%');
  } else {
    rows = db.prepare(`
      SELECT id, name, rank, created_at FROM users
      ORDER BY created_at DESC LIMIT 100
    `).all();
  }
  res.json({
    users: rows.map(u => ({
      id: u.id, name: u.name, rank: u.rank, createdAt: u.created_at,
    })),
  });
});

/* PATCH /api/admin/users/:id/rank  (auth, admin+) */
router.patch('/admin/users/:id/rank', requireAuth, (req, res) => {
  if (!canPromoteOthers(req.user.rank)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const target = db.prepare(`SELECT id, name, rank FROM users WHERE id = ?`).get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const newRank = String(req.body?.rank || '').trim();
  if (!RANKS.some(r => r.key === newRank)) {
    return res.status(400).json({ error: 'Invalid rank.' });
  }

  // Can the actor modify this target at all?
  if (target.id !== req.user.id && !canModifyUser(req.user.rank, target.rank)) {
    return res.status(403).json({ error: 'Cannot modify a user at or above your level.' });
  }
  // Can the actor assign this specific rank?
  if (!canAssignRank(req.user.rank, newRank)) {
    return res.status(403).json({ error: 'Cannot assign that rank.' });
  }
  // Don't let a non-Owner demote themselves out of admin powers in a confusing way:
  // (still allow self-demotion, but prevent the last Owner from leaving)
  if (target.rank === 'owner' && newRank !== 'owner') {
    const otherOwners = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE rank = 'owner' AND id != ?`).get(target.id).c;
    if (otherOwners === 0) {
      return res.status(409).json({ error: 'Cannot demote the last Owner.' });
    }
  }

  db.prepare(`UPDATE users SET rank = ? WHERE id = ?`).run(newRank, target.id);

  const updated = db.prepare(`SELECT id, name, rank, created_at FROM users WHERE id = ?`).get(target.id);
  res.json({
    user: { id: updated.id, name: updated.name, rank: updated.rank, createdAt: updated.created_at },
  });
});

/* GET /api/admin/ranks  —  exposes the rank table for the admin UI */
router.get('/admin/ranks', (_req, res) => {
  res.json({ ranks: RANKS });
});

module.exports = router;
