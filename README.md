# KillVolute

A self-hosted forum with a real backend. Threads, replies, voting, leaderboard, announcements — all persisted server-side, with real session-based auth.

## Stack

- **Node 22+** (uses built-in `node:sqlite`)
- **Express** for routing
- **SQLite** for storage (single file in `data/`)
- **bcryptjs** for password hashing
- **HTTP-only cookies** for session tokens
- Frontend: vanilla HTML/CSS/JS — no build step

## Requirements

- Node.js **22 or newer** (`node --version` should print `v22.x` or higher)

## Install & run

```bash
npm install
npm start
```

Then open <http://localhost:3000>.

For development with auto-reload:

```bash
npm run dev
```

To run on a different port:

```bash
PORT=8080 npm start
```

## Data

SQLite database lives at `data/killvolute.db`. It is created automatically on first run. To wipe everything and start fresh, just delete that file.

To point at a different location:

```bash
KV_DATA_DIR=/var/lib/killvolute npm start
# or
KV_DB_PATH=/var/lib/killvolute/forum.db npm start
```

## Project layout

```
.
├── package.json
├── server/
│   ├── index.js              Express bootstrap
│   ├── db.js                 SQLite schema + helpers
│   ├── auth.js               bcrypt + sessions + middleware
│   └── routes/
│       ├── auth.js           /api/signup, /signin, /signout, /me
│       ├── threads.js        /api/threads, /api/vote
│       ├── announcements.js  /api/announcements
│       └── users.js          /api/leaderboard, /api/users/:name, /api/stats
└── public/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js            fetch wrapper
        ├── auth.js           sign-up / sign-in modal
        └── app.js            SPA router + view rendering
```

## API

All endpoints accept and return JSON. Authenticated endpoints require the `kv_session` cookie set by `/api/signup` or `/api/signin`.

### Auth

| Method | Path             | Auth | Body                            | Notes |
|--------|------------------|------|---------------------------------|-------|
| POST   | `/api/signup`    | —    | `{ name, password }`            | name: 3-20 chars `a-z0-9_`. Sets session cookie. |
| POST   | `/api/signin`    | —    | `{ name, password }`            | Sets session cookie. |
| POST   | `/api/signout`   | —    | —                               | Clears cookie and deletes session row. |
| GET    | `/api/me`        | —    | —                               | Returns `{ user }` or `{ user: null }`. |

### Threads & replies

| Method | Path                                  | Auth | Body                              |
|--------|---------------------------------------|------|-----------------------------------|
| GET    | `/api/threads?sort=&category=&q=`     | —    | —                                 |
| GET    | `/api/threads/:id`                    | —    | —                                 |
| POST   | `/api/threads`                        | yes  | `{ title, body, category }`       |
| POST   | `/api/threads/:id/replies`            | yes  | `{ body }`                        |
| POST   | `/api/vote`                           | yes  | `{ kind, id, value }` (value in -1/0/1) |

`sort` is one of `recent`, `top`, `replies`. Valid categories: `Announcements`, `Suggestions`, `General`, `Bug Reports`.

### Announcements

| Method | Path                  | Auth | Body                |
|--------|-----------------------|------|---------------------|
| GET    | `/api/announcements`  | —    | —                   |
| POST   | `/api/announcements`  | yes  | `{ title, body }`   |

### Users & stats

| Method | Path                   | Auth | Notes |
|--------|------------------------|------|-------|
| GET    | `/api/leaderboard`     | —    | Top 100 by reputation. |
| GET    | `/api/users/:name`     | —    | Public profile. |
| GET    | `/api/stats`           | —    | Counts of users, threads, replies. |
| GET    | `/api/health`          | —    | `{ ok: true, ts }`. |

## Ranks & Moderation

KillVolute has a built-in rank hierarchy. The **first user to sign up automatically becomes the Owner** — there is no separate setup step.

| Rank                  | Level | Powers                                                           |
|-----------------------|-------|------------------------------------------------------------------|
| Owner                 | 100   | All powers, including promoting/demoting other Owners.            |
| Senior Administrator  | 90    | Can promote up to Lead Moderator. Full moderation powers.         |
| Administrator         | 80    | Can promote up to Senior Moderator. Full moderation powers.       |
| Lead Moderator        | 70    | Edit/delete any post.                                             |
| Senior Moderator      | 60    | Edit/delete any post.                                             |
| Moderator             | 50    | Edit/delete any post.                                             |
| Support Team          | 30    | Visible badge only; no special powers.                            |
| Member                | 0     | Default. Edit/delete own posts only.                              |

Rules enforced server-side:
- Only ranks 80+ can change other users' ranks.
- Non-Owners can only assign ranks **strictly below their own level**.
- Non-Owners cannot modify users at or above their own level.
- The last Owner cannot be demoted (HTTP 409 if attempted).
- Moderators (50+) bypass author checks for edit/delete on threads and replies.

A user's rank is shown:
- In the header next to their name
- As a chip next to their name in topic rows, replies, and the leaderboard
- On the **Staff** page, grouped by rank

The **Admin Panel** (button appears in the header for ranks 80+) lets you search users and change their rank. The dropdown only shows ranks the actor is allowed to assign.

### Admin API

| Method | Path                              | Auth    | Body / Query                      |
|--------|-----------------------------------|---------|-----------------------------------|
| GET    | `/api/staff`                      | —       | —                                 |
| GET    | `/api/admin/ranks`                | —       | —                                 |
| GET    | `/api/admin/users?q=`             | 80+     | —                                 |
| PATCH  | `/api/admin/users/:id/rank`       | 80+     | `{ rank }`                        |
| PATCH  | `/api/threads/:id`                | author or mod+ | `{ title?, body?, category? }` |
| DELETE | `/api/threads/:id`                | author or mod+ | —                            |
| PATCH  | `/api/replies/:id`                | author or mod+ | `{ body }`                   |
| DELETE | `/api/replies/:id`                | author or mod+ | —                            |

## Security notes

- Passwords are hashed with **bcrypt** (10 rounds). Plain passwords are never stored.
- Session tokens are 32 random bytes hex-encoded, stored in the `sessions` table, served as `HttpOnly` cookies (and `Secure` when `NODE_ENV=production`).
- Sessions expire after 30 days. Expired sessions are pruned on startup and lazily on access.
- A small in-memory rate limiter caps every IP at 120 API requests per minute.
- Request bodies are capped at 128 KB and string fields are clamped server-side.
- All user-supplied content is escaped client-side before rendering.

## Production

For real deployment:

1. Set `NODE_ENV=production` so the session cookie gets the `Secure` flag.
2. Put the server behind a reverse proxy with TLS (nginx, Caddy, Cloudflare).
3. Use a process manager (`systemd`, `pm2`) to keep it running.
4. Back up `data/killvolute.db` regularly. SQLite is a single file; copying it while the server is running is safe because of WAL mode.
