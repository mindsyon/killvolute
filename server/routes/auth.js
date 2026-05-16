/* =========================================================
   server/routes/auth.js
   ========================================================= */

const express = require('express');
const router = express.Router();

const {
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
  findUserByName,
  createUser,
  createSession,
  deleteSession,
  setSessionCookie,
  clearSessionCookie,
  COOKIE_NAME,
  requireAuth,
} = require('../auth');

const { maybePromoteFirstUserToOwner } = require('../db');

/* POST /api/signup */
router.post('/signup', async (req, res) => {
  const name = String(req.body?.name || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const uErr = validateUsername(name);
  if (uErr) return res.status(400).json({ error: uErr });
  const pErr = validatePassword(password);
  if (pErr) return res.status(400).json({ error: pErr });

  if (findUserByName(name)) {
    return res.status(409).json({ error: 'Username already taken.' });
  }

  const hash = await hashPassword(password);
  let user = createUser(name, hash);

  // First user on the forum auto-promotes to Owner.
  maybePromoteFirstUserToOwner();
  user = require('../auth').findUserById(user.id);

  const { token } = createSession(user.id);
  setSessionCookie(res, token);

  res.json({ user: { id: user.id, name: user.name, rank: user.rank } });
});

/* POST /api/signin */
router.post('/signin', async (req, res) => {
  const name = String(req.body?.name || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!name || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const user = findUserByName(name);
  if (!user) {
    await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid').catch(() => {});
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const ok = await verifyPassword(password, user.hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });

  const { token } = createSession(user.id);
  setSessionCookie(res, token);

  res.json({ user: { id: user.id, name: user.name, rank: user.rank } });
});

/* POST /api/signout */
router.post('/signout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

/* GET /api/me */
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: { id: req.user.id, name: req.user.name, rank: req.user.rank } });
});

module.exports = router;
