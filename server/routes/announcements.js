/* =========================================================
   server/routes/announcements.js
   ========================================================= */

const express = require('express');
const router = express.Router();

const { db, uid } = require('../db');
const { requireAuth } = require('../auth');
const {
  canPostAnnouncement,
  canEditAnnouncement,
  canDeleteAnnouncement,
} = require('../ranks');

function clampStr(s, max) { return String(s || '').slice(0, max); }

function serialize(a) {
  return {
    id:         a.id,
    title:      a.title,
    body:       a.body,
    authorId:   a.author_id,
    authorName: a.author_name,
    authorRank: a.author_rank || 'member',
    createdAt:  a.created_at,
    editedAt:   a.edited_at || null,
  };
}

/* GET /api/announcements  — public */
router.get('/announcements', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name AS author_name, u.rank AS author_rank
    FROM announcements a JOIN users u ON u.id = a.author_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();
  res.json({ announcements: rows.map(serialize) });
});

/* POST /api/announcements  — Lead Moderator+ (level 70+) */
router.post('/announcements', requireAuth, (req, res) => {
  if (!canPostAnnouncement(req.user.rank)) {
    return res.status(403).json({ error: 'Lead Moderator or above required.' });
  }

  const title = clampStr(req.body?.title, 200).trim();
  const body  = clampStr(req.body?.body, 10000).trim();
  if (!title || !body) return res.status(400).json({ error: 'Title and body required.' });

  const id = uid('a');
  db.prepare(`
    INSERT INTO announcements (id, title, body, author_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, title, body, req.user.id, Date.now());

  const a = db.prepare(`
    SELECT a.*, u.name AS author_name, u.rank AS author_rank
    FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.id = ?
  `).get(id);

  res.json({ announcement: serialize(a) });
});

/* PATCH /api/announcements/:id  — Lead Moderator+ (level 70+) */
router.patch('/announcements/:id', requireAuth, (req, res) => {
  const a = db.prepare(`SELECT * FROM announcements WHERE id = ?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Announcement not found.' });

  // Author can always edit their own; Lead Mod+ can edit anyone's
  const isAuthor = a.author_id === req.user.id;
  if (!isAuthor && !canEditAnnouncement(req.user.rank)) {
    return res.status(403).json({ error: 'Lead Moderator or above required.' });
  }
  // Even if you're the author, you still need Lead Mod+ to touch announcements
  if (!canEditAnnouncement(req.user.rank)) {
    return res.status(403).json({ error: 'Lead Moderator or above required.' });
  }

  const updates = [];
  const params  = [];
  if (typeof req.body?.title === 'string') {
    const title = clampStr(req.body.title, 200).trim();
    if (!title) return res.status(400).json({ error: 'Title cannot be empty.' });
    updates.push('title = ?'); params.push(title);
  }
  if (typeof req.body?.body === 'string') {
    const body = clampStr(req.body.body, 10000).trim();
    if (!body) return res.status(400).json({ error: 'Body cannot be empty.' });
    updates.push('body = ?'); params.push(body);
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

  updates.push('edited_at = ?'); params.push(Date.now());
  params.push(a.id);
  db.prepare(`UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`
    SELECT a.*, u.name AS author_name, u.rank AS author_rank
    FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.id = ?
  `).get(a.id);

  res.json({ announcement: serialize(updated) });
});

/* DELETE /api/announcements/:id  — Administrator+ (level 80+) */
router.delete('/announcements/:id', requireAuth, (req, res) => {
  const a = db.prepare(`SELECT * FROM announcements WHERE id = ?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Announcement not found.' });

  if (!canDeleteAnnouncement(req.user.rank)) {
    return res.status(403).json({ error: 'Administrator or above required.' });
  }

  db.prepare(`DELETE FROM announcements WHERE id = ?`).run(a.id);
  res.json({ ok: true });
});

module.exports = router;
