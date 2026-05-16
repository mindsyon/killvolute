/* =========================================================
   server/routes/threads.js
   ========================================================= */

const express = require('express');
const router = express.Router();

const {
  db, uid, voteSum, userVote, setVote, replyCountByThread,
} = require('../db');
const { requireAuth } = require('../auth');
const { canModerate } = require('../ranks');

const CATEGORIES = ['Announcements', 'Suggestions', 'General', 'Bug Reports'];

function normCategory(c) {
  c = String(c || '').trim();
  return CATEGORIES.includes(c) ? c : 'General';
}

function clampStr(s, max) {
  return String(s || '').slice(0, max);
}

function serializeThread(t, viewerId, replyCounts) {
  return {
    id: t.id,
    title: t.title,
    body: t.body,
    category: t.category,
    authorId: t.author_id,
    authorName: t.author_name,
    authorRank: t.author_rank || 'member',
    createdAt: t.created_at,
    editedAt: t.edited_at || null,
    views: t.views,
    votes: voteSum('thread', t.id),
    userVote: userVote('thread', t.id, viewerId),
    replyCount: replyCounts ? (replyCounts[t.id] || 0) : undefined,
  };
}

function serializeReply(r, viewerId) {
  return {
    id: r.id,
    threadId: r.thread_id,
    body: r.body,
    authorId: r.author_id,
    authorName: r.author_name,
    authorRank: r.author_rank || 'member',
    createdAt: r.created_at,
    editedAt: r.edited_at || null,
    votes: voteSum('reply', r.id),
    userVote: userVote('reply', r.id, viewerId),
  };
}

/* GET /api/threads */
router.get('/threads', (req, res) => {
  const sort = req.query.sort || 'recent';
  const category = req.query.category || '';
  const q = (req.query.q || '').toLowerCase();

  let rows;
  if (sort === 'top') {
    rows = db.prepare(`
      SELECT t.*, u.name AS author_name, u.rank AS author_rank,
        COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.target_kind='thread' AND v.target_id=t.id), 0) AS s
      FROM threads t JOIN users u ON u.id = t.author_id
      ORDER BY s DESC, t.created_at DESC
      LIMIT 200
    `).all();
  } else if (sort === 'replies') {
    rows = db.prepare(`
      SELECT t.*, u.name AS author_name, u.rank AS author_rank,
        (SELECT COUNT(*) FROM replies r WHERE r.thread_id = t.id) AS rc
      FROM threads t JOIN users u ON u.id = t.author_id
      ORDER BY rc DESC, t.created_at DESC
      LIMIT 200
    `).all();
  } else {
    rows = db.prepare(`
      SELECT t.*, u.name AS author_name, u.rank AS author_rank
      FROM threads t JOIN users u ON u.id = t.author_id
      ORDER BY t.created_at DESC
      LIMIT 200
    `).all();
  }

  if (category) rows = rows.filter(t => t.category === category);
  if (q) rows = rows.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.body.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q)
  );

  const counts = replyCountByThread();
  res.json({
    threads: rows.map(t => serializeThread(t, req.user?.id, counts)),
  });
});

/* GET /api/threads/:id */
router.get('/threads/:id', (req, res) => {
  const t = db.prepare(`
    SELECT t.*, u.name AS author_name, u.rank AS author_rank
    FROM threads t JOIN users u ON u.id = t.author_id
    WHERE t.id = ?
  `).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Thread not found.' });

  db.prepare(`UPDATE threads SET views = views + 1 WHERE id = ?`).run(t.id);
  t.views += 1;

  const replies = db.prepare(`
    SELECT r.*, u.name AS author_name, u.rank AS author_rank
    FROM replies r JOIN users u ON u.id = r.author_id
    WHERE r.thread_id = ?
    ORDER BY r.created_at ASC
  `).all(t.id);

  res.json({
    thread: serializeThread(t, req.user?.id),
    replies: replies.map(r => serializeReply(r, req.user?.id)),
  });
});

/* POST /api/threads  (auth) */
router.post('/threads', requireAuth, (req, res) => {
  const title = clampStr(req.body?.title, 200).trim();
  const body  = clampStr(req.body?.body, 10000).trim();
  const category = normCategory(req.body?.category);

  if (!title) return res.status(400).json({ error: 'Title required.' });
  if (!body)  return res.status(400).json({ error: 'Body required.' });

  const id = uid('t');
  db.prepare(`
    INSERT INTO threads (id, title, body, category, author_id, created_at, views)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, title, body, category, req.user.id, Date.now());

  const t = db.prepare(`
    SELECT t.*, u.name AS author_name, u.rank AS author_rank
    FROM threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?
  `).get(id);

  res.json({ thread: serializeThread(t, req.user.id) });
});

/* POST /api/threads/:id/replies  (auth) */
router.post('/threads/:id/replies', requireAuth, (req, res) => {
  const t = db.prepare(`SELECT id FROM threads WHERE id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Thread not found.' });

  const body = clampStr(req.body?.body, 10000).trim();
  if (!body) return res.status(400).json({ error: 'Reply body required.' });

  const id = uid('r');
  db.prepare(`
    INSERT INTO replies (id, thread_id, body, author_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, t.id, body, req.user.id, Date.now());

  const r = db.prepare(`
    SELECT r.*, u.name AS author_name, u.rank AS author_rank
    FROM replies r JOIN users u ON u.id = r.author_id WHERE r.id = ?
  `).get(id);

  res.json({ reply: serializeReply(r, req.user.id) });
});

/* POST /api/vote  (auth)
   body: { kind: 'thread'|'reply', id: '<id>', value: -1|0|1 }
*/
router.post('/vote', requireAuth, (req, res) => {
  const kind = req.body?.kind;
  const id = req.body?.id;
  let value = Number(req.body?.value);
  if (!['thread', 'reply'].includes(kind)) return res.status(400).json({ error: 'Invalid kind.' });
  if (!id) return res.status(400).json({ error: 'Missing id.' });
  if (![1, 0, -1].includes(value)) return res.status(400).json({ error: 'Invalid value.' });

  // verify target exists
  const exists = (kind === 'thread'
    ? db.prepare(`SELECT id FROM threads WHERE id = ?`).get(id)
    : db.prepare(`SELECT id FROM replies WHERE id = ?`).get(id));
  if (!exists) return res.status(404).json({ error: 'Target not found.' });

  setVote(req.user.id, kind, id, value);

  res.json({
    kind, id,
    votes: voteSum(kind, id),
    userVote: userVote(kind, id, req.user.id),
  });
});

/* PATCH /api/threads/:id  (auth; owner or mod+) */
router.patch('/threads/:id', requireAuth, (req, res) => {
  const t = db.prepare(`SELECT * FROM threads WHERE id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Thread not found.' });

  const isOwner = t.author_id === req.user.id;
  if (!isOwner && !canModerate(req.user.rank)) {
    return res.status(403).json({ error: 'Not allowed.' });
  }

  const updates = [];
  const params = [];
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
  if (typeof req.body?.category === 'string') {
    updates.push('category = ?'); params.push(normCategory(req.body.category));
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });

  updates.push('edited_at = ?'); params.push(Date.now());
  params.push(t.id);
  db.prepare(`UPDATE threads SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`
    SELECT t.*, u.name AS author_name, u.rank AS author_rank
    FROM threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?
  `).get(t.id);
  res.json({ thread: serializeThread(updated, req.user.id) });
});

/* DELETE /api/threads/:id  (auth; owner or mod+) */
router.delete('/threads/:id', requireAuth, (req, res) => {
  const t = db.prepare(`SELECT * FROM threads WHERE id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Thread not found.' });
  const isOwner = t.author_id === req.user.id;
  if (!isOwner && !canModerate(req.user.rank)) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  db.prepare(`DELETE FROM threads WHERE id = ?`).run(t.id);
  res.json({ ok: true });
});

/* PATCH /api/replies/:id  (auth; owner or mod+) */
router.patch('/replies/:id', requireAuth, (req, res) => {
  const r = db.prepare(`SELECT * FROM replies WHERE id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Reply not found.' });
  const isOwner = r.author_id === req.user.id;
  if (!isOwner && !canModerate(req.user.rank)) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  const body = clampStr(req.body?.body, 10000).trim();
  if (!body) return res.status(400).json({ error: 'Body cannot be empty.' });
  db.prepare(`UPDATE replies SET body = ?, edited_at = ? WHERE id = ?`).run(body, Date.now(), r.id);

  const updated = db.prepare(`
    SELECT r.*, u.name AS author_name, u.rank AS author_rank
    FROM replies r JOIN users u ON u.id = r.author_id WHERE r.id = ?
  `).get(r.id);
  res.json({ reply: serializeReply(updated, req.user.id) });
});

/* DELETE /api/replies/:id  (auth; owner or mod+) */
router.delete('/replies/:id', requireAuth, (req, res) => {
  const r = db.prepare(`SELECT * FROM replies WHERE id = ?`).get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Reply not found.' });
  const isOwner = r.author_id === req.user.id;
  if (!isOwner && !canModerate(req.user.rank)) {
    return res.status(403).json({ error: 'Not allowed.' });
  }
  db.prepare(`DELETE FROM replies WHERE id = ?`).run(r.id);
  res.json({ ok: true });
});

module.exports = router;
