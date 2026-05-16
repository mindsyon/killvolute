/* =========================================================
   server/db.js  —  SQLite schema, migrations, helpers
   ========================================================= */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.KV_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.KV_DB_PATH || path.join(DATA_DIR, 'killvolute.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

/* ----- Schema ----- */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    hash        TEXT NOT NULL,
    rank        TEXT NOT NULL DEFAULT 'member',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS threads (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'General',
    author_id   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    edited_at   INTEGER,
    views       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_threads_created ON threads(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_threads_author ON threads(author_id);
  CREATE INDEX IF NOT EXISTS idx_threads_category ON threads(category);

  CREATE TABLE IF NOT EXISTS replies (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL,
    body        TEXT NOT NULL,
    author_id   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    edited_at   INTEGER,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_replies_author ON replies(author_id);

  CREATE TABLE IF NOT EXISTS votes (
    user_id     TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('thread','reply')),
    target_id   TEXT NOT NULL,
    value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, target_kind, target_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_kind, target_id);

  CREATE TABLE IF NOT EXISTS announcements (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    author_id   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    edited_at   INTEGER,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);
`);

/* ----- Migrations: backfill rank column on existing DBs ----- */

{
  const cols = db.prepare(`PRAGMA table_info(users)`).all();
  const hasRank = cols.some(c => c.name === 'rank');
  if (!hasRank) {
    db.exec(`ALTER TABLE users ADD COLUMN rank TEXT NOT NULL DEFAULT 'member'`);
  }

  const tCols = db.prepare(`PRAGMA table_info(threads)`).all();
  if (!tCols.some(c => c.name === 'edited_at')) {
    db.exec(`ALTER TABLE threads ADD COLUMN edited_at INTEGER`);
  }

  const rCols = db.prepare(`PRAGMA table_info(replies)`).all();
  if (!rCols.some(c => c.name === 'edited_at')) {
    db.exec(`ALTER TABLE replies ADD COLUMN edited_at INTEGER`);
  }

  const aCols = db.prepare(`PRAGMA table_info(announcements)`).all();
  if (!aCols.some(c => c.name === 'edited_at')) {
    db.exec(`ALTER TABLE announcements ADD COLUMN edited_at INTEGER`);
  }
}

/* ----- Bootstrap: first user ever to sign up becomes Owner ----- */

function maybePromoteFirstUserToOwner() {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
  if (count !== 1) return; // only fire when exactly one user exists
  const ownerCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE rank = 'owner'`).get().c;
  if (ownerCount > 0) return; // already have an owner
  db.prepare(`UPDATE users SET rank = 'owner'`).run();
}

/* ----- Vote helpers (derived sums; cheap on indexed columns) ----- */

function voteSum(targetKind, targetId) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(value), 0) AS s FROM votes WHERE target_kind = ? AND target_id = ?`
  ).get(targetKind, targetId);
  return row ? row.s : 0;
}

function userVote(targetKind, targetId, userId) {
  if (!userId) return 0;
  const row = db.prepare(
    `SELECT value FROM votes WHERE target_kind = ? AND target_id = ? AND user_id = ?`
  ).get(targetKind, targetId, userId);
  return row ? row.value : 0;
}

function setVote(userId, targetKind, targetId, value) {
  if (value === 0) {
    db.prepare(
      `DELETE FROM votes WHERE user_id = ? AND target_kind = ? AND target_id = ?`
    ).run(userId, targetKind, targetId);
    return;
  }
  db.prepare(`
    INSERT INTO votes (user_id, target_kind, target_id, value, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, target_kind, target_id)
      DO UPDATE SET value = excluded.value, created_at = excluded.created_at
  `).run(userId, targetKind, targetId, value, Date.now());
}

/* ----- Reputation (sum of votes on all things the user authored) ----- */

function reputationFor(userId) {
  const tSum = db.prepare(`
    SELECT COALESCE(SUM(v.value), 0) AS s
    FROM threads t LEFT JOIN votes v
      ON v.target_kind = 'thread' AND v.target_id = t.id
    WHERE t.author_id = ?
  `).get(userId)?.s || 0;
  const rSum = db.prepare(`
    SELECT COALESCE(SUM(v.value), 0) AS s
    FROM replies r LEFT JOIN votes v
      ON v.target_kind = 'reply' AND v.target_id = r.id
    WHERE r.author_id = ?
  `).get(userId)?.s || 0;
  return tSum + rSum;
}

function leaderboard(limit = 50) {
  return db.prepare(`
    SELECT u.id, u.name,
      COALESCE(
        (SELECT SUM(v.value) FROM threads t JOIN votes v ON v.target_kind='thread' AND v.target_id=t.id WHERE t.author_id = u.id),
      0)
      + COALESCE(
        (SELECT SUM(v.value) FROM replies r JOIN votes v ON v.target_kind='reply' AND v.target_id=r.id WHERE r.author_id = u.id),
      0) AS score
    FROM users u
    ORDER BY score DESC
    LIMIT ?
  `).all(limit);
}

/* ----- Reply count helper ----- */

function replyCountByThread() {
  const rows = db.prepare(`SELECT thread_id, COUNT(*) AS c FROM replies GROUP BY thread_id`).all();
  const m = {};
  rows.forEach(r => { m[r.thread_id] = r.c; });
  return m;
}

/* ----- Random IDs ----- */

function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/* ----- Expire stale sessions on startup ----- */

db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(Date.now());

module.exports = {
  db,
  uid,
  voteSum,
  userVote,
  setVote,
  reputationFor,
  leaderboard,
  replyCountByThread,
  maybePromoteFirstUserToOwner,
};
