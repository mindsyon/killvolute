/* =========================================================
   server/auth.js  —  bcrypt password hashing + sessions
   ========================================================= */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, uid } = require('./db');

const BCRYPT_ROUNDS = 10;
const SESSION_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COOKIE_NAME = 'kv_session';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/* ----- Validation ----- */

function validateUsername(name) {
  if (!name) return 'Username required.';
  if (typeof name !== 'string') return 'Invalid username.';
  if (!USERNAME_RE.test(name)) return 'Use 3-20 chars: a-z, 0-9, underscore.';
  return null;
}

function validatePassword(pw) {
  if (!pw) return 'Password required.';
  if (typeof pw !== 'string') return 'Invalid password.';
  if (pw.length < 6) return 'Password must be at least 6 characters.';
  if (pw.length > 200) return 'Password too long.';
  return null;
}

/* ----- Password helpers ----- */

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/* ----- User lookups ----- */

function findUserByName(name) {
  return db.prepare(`SELECT * FROM users WHERE name = ?`).get(name) || null;
}

function findUserById(id) {
  return db.prepare(`SELECT id, name, rank, created_at FROM users WHERE id = ?`).get(id) || null;
}

function createUser(name, hash) {
  const id = uid('u');
  db.prepare(
    `INSERT INTO users (id, name, hash, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, name, hash, Date.now());
  return findUserById(id);
}

/* ----- Sessions ----- */

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(userId) {
  const token = newSessionToken();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  ).run(token, userId, now, now + SESSION_LIFETIME_MS);
  return { token, expiresAt: now + SESSION_LIFETIME_MS };
}

function deleteSession(token) {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id AS user_id, u.name AS user_name, u.rank AS user_rank
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(token);
    return null;
  }
  return { id: row.user_id, name: row.user_name, rank: row.user_rank, sessionToken: row.token };
}

/* ----- Cookie helpers ----- */

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_LIFETIME_MS,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/* ----- Middleware: populate req.user when the cookie is valid ----- */

function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  req.user = userFromToken(token);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  next();
}

function requireMod(req, res, next) {
  const { canModerate } = require('./ranks');
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  if (!canModerate(req.user.rank)) return res.status(403).json({ error: 'Moderator access required.' });
  next();
}

module.exports = {
  COOKIE_NAME,
  validateUsername,
  validatePassword,
  hashPassword,
  verifyPassword,
  findUserByName,
  findUserById,
  createUser,
  createSession,
  deleteSession,
  userFromToken,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireAuth,
  requireMod,
};
