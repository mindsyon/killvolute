/* =========================================================
   app.js - router, renderers, interactions
   ========================================================= */

let state = loadState();

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd ago';
  return Math.floor(d / 30) + 'mo ago';
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtToday() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function emptyState(title, body, actionText, action) {
  return `
    <div class="empty-state">
      <div class="empty-icon">KV</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(body)}</p>
      ${actionText ? `<button class="cta empty-action">${escapeHTML(actionText)}</button>` : ''}
    </div>
  `;
}

let currentRoute = 'home';
let currentThreadId = null;

function go(route, opts={}) {
  currentRoute = route;
  if (opts.threadId) currentThreadId = opts.threadId;

  $$('.view').forEach(v => { v.hidden = v.dataset.view !== route; });
  $$('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });

  window.scrollTo({ top: 0, behavior: 'instant' });

  if (route === 'home') renderHome();
  else if (route === 'discussions') renderDiscussions();
  else if (route === 'thread') renderThread();
  else if (route === 'announcements') renderAnnouncements();
  else if (route === 'leaderboard') renderLeaderboard();
}

document.addEventListener('click', e => {
  const link = e.target.closest('[data-route]');
  if (!link) return;
  e.preventDefault();
  go(link.dataset.route);
});

function renderHome() {
  const lead = [...state.threads].sort((a,b) => b.votes - a.votes)[0];
  const leadCta = $('#lead-cta');

  if (lead) {
    $('#lead-title').textContent = lead.title;
    $('#lead-byline').textContent = `${userById(state, lead.authorId).name} - ${fmtDate(lead.createdAt)}`;
    $('#lead-excerpt').textContent = lead.body.slice(0, 240) + (lead.body.length > 240 ? '...' : '');
    leadCta.textContent = 'Read discussion';
    leadCta.onclick = () => go('thread', { threadId: lead.id });
  } else {
    $('#lead-title').textContent = 'No featured thread yet';
    $('#lead-byline').textContent = 'Create the first discussion to feature it here.';
    $('#lead-excerpt').textContent = 'KillVolute is empty by design now. Sign in, post a thread, and the homepage will start filling itself from real activity.';
    leadCta.textContent = 'New thread';
    leadCta.onclick = openNewThreadModal;
  }

  const ann = [...state.announcements].sort((a,b) => b.createdAt - a.createdAt).slice(0, 4);
  $('#home-announcements').innerHTML = ann.map(a => `
    <li>
      <span class="ann-date">${fmtDate(a.createdAt)}</span>
      <span class="ann-title">${escapeHTML(a.title)}</span>
    </li>
  `).join('') || '<li class="muted-row">No announcements yet.</li>';

  const rep = computeReputation(state);
  const top = state.users
    .map(u => ({ ...u, score: rep[u.id] || 0 }))
    .filter(u => u.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, 5);

  $('#home-leaderboard').innerHTML = top.map(u => `
    <li><span class="rank-name">${escapeHTML(u.name)}</span><span class="rank-score">${u.score} pts</span></li>
  `).join('') || '<li class="muted-row">No reputation yet.</li>';

  const recent = [...state.threads].sort((a,b) => b.createdAt - a.createdAt).slice(0, 6);
  $('#home-recent').innerHTML = recent.map(t => `
    <div class="recent-item" data-thread="${t.id}">
      <h4>${escapeHTML(t.title)}</h4>
      <div class="meta">${escapeHTML(userById(state, t.authorId).name)} - ${timeAgo(t.createdAt)} - ${t.votes} pts</div>
    </div>
  `).join('') || emptyState('No discussions yet', 'Start the first thread and it will appear here.', 'Start first thread');

  $('#home-recent .empty-action')?.addEventListener('click', openNewThreadModal);
  $$('#home-recent .recent-item').forEach(el => {
    el.onclick = () => go('thread', { threadId: el.dataset.thread });
  });
}

function renderDiscussions() {
  const q = ($('#search-input').value || '').toLowerCase();
  const sort = $('#sort-select').value;

  let list = state.threads.slice();
  if (q) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      (t.tag || '').toLowerCase().includes(q)
    );
  }

  if (sort === 'recent') list.sort((a,b) => b.createdAt - a.createdAt);
  else if (sort === 'top') list.sort((a,b) => b.votes - a.votes);
  else if (sort === 'replies') {
    const counts = {};
    state.replies.forEach(r => { counts[r.threadId] = (counts[r.threadId] || 0) + 1; });
    list.sort((a,b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  }

  const replyCounts = {};
  state.replies.forEach(r => { replyCounts[r.threadId] = (replyCounts[r.threadId] || 0) + 1; });

  $('#thread-list').innerHTML = list.map(t => `
    <div class="thread-row" data-thread="${t.id}">
      <div class="thread-votes">
        <span class="num">${t.votes}</span>
        <span class="lbl">votes</span>
      </div>
      <div class="thread-body">
        <h3>${escapeHTML(t.title)}</h3>
        <p class="excerpt">${escapeHTML(t.body)}</p>
        <div class="thread-meta">
          <span>${escapeHTML(userById(state, t.authorId).name)}</span>
          <span>${timeAgo(t.createdAt)}</span>
          <span>${replyCounts[t.id] || 0} replies</span>
        </div>
      </div>
      <span class="thread-tag">${escapeHTML(t.tag || 'general')}</span>
    </div>
  `).join('') || emptyState('Nothing posted yet', 'KillVolute has no threads. Make the first one.', 'New thread');

  $('#thread-list .empty-action')?.addEventListener('click', openNewThreadModal);
  $$('.thread-row').forEach(row => {
    row.onclick = () => go('thread', { threadId: row.dataset.thread });
  });
}

$('#search-input').addEventListener('input', () => { if (currentRoute === 'discussions') renderDiscussions(); });
$('#sort-select').addEventListener('change', () => { if (currentRoute === 'discussions') renderDiscussions(); });

function renderThread() {
  const t = state.threads.find(x => x.id === currentThreadId);
  if (!t) {
    $('#thread-detail').innerHTML = emptyState('Thread not found', 'This thread may have been deleted or reset.', 'Back to discussions');
    $('#thread-detail .empty-action')?.addEventListener('click', () => go('discussions'));
    $('#replies-list').innerHTML = '';
    return;
  }

  const author = userById(state, t.authorId);
  const userVote = state.currentUser ? (t.voters[state.currentUser.id] || 0) : 0;

  $('#thread-detail').innerHTML = `
    <span class="tag">${escapeHTML(t.tag || 'general')}</span>
    <h2>${escapeHTML(t.title)}</h2>
    <div class="meta">By ${escapeHTML(author.name)} - ${fmtDate(t.createdAt)} - ${timeAgo(t.createdAt)}</div>
    <div class="body">${escapeHTML(t.body)}</div>
    <div class="vote-bar">
      <button class="vote-btn ${userVote === 1 ? 'active' : ''}" data-vote="up" data-target="thread" data-id="${t.id}">Upvote</button>
      <span class="vote-score">${t.votes}</span>
      <button class="vote-btn ${userVote === -1 ? 'active' : ''}" data-vote="down" data-target="thread" data-id="${t.id}">Downvote</button>
    </div>
  `;

  const replies = state.replies.filter(r => r.threadId === t.id).sort((a,b) => a.createdAt - b.createdAt);
  $('#replies-list').innerHTML = replies.map(r => {
    const ra = userById(state, r.authorId);
    const rv = state.currentUser ? (r.voters[state.currentUser.id] || 0) : 0;
    return `
      <div class="reply">
        <div class="meta"><strong>${escapeHTML(ra.name)}</strong> - ${timeAgo(r.createdAt)}</div>
        <div class="body">${escapeHTML(r.body)}</div>
        <div class="vote-bar">
          <button class="vote-btn ${rv === 1 ? 'active' : ''}" data-vote="up" data-target="reply" data-id="${r.id}">Up</button>
          <span class="vote-score">${r.votes}</span>
          <button class="vote-btn ${rv === -1 ? 'active' : ''}" data-vote="down" data-target="reply" data-id="${r.id}">Down</button>
        </div>
      </div>
    `;
  }).join('') || '<p class="muted-text">No replies yet.</p>';

  $$('.vote-btn').forEach(b => {
    b.onclick = () => handleVote(b.dataset.target, b.dataset.id, b.dataset.vote === 'up' ? 1 : -1);
  });
}

function handleVote(target, id, delta) {
  if (!state.currentUser) {
    openLoginModal();
    return;
  }
  const uid = state.currentUser.id;
  const collection = target === 'thread' ? state.threads : state.replies;
  const item = collection.find(x => x.id === id);
  if (!item) return;
  const prev = item.voters[uid] || 0;
  const next = prev === delta ? 0 : delta;
  item.votes += next - prev;
  if (next === 0) delete item.voters[uid];
  else item.voters[uid] = next;
  saveState(state);
  if (currentRoute === 'thread') renderThread();
}

$('#reply-submit').addEventListener('click', () => {
  if (!state.currentUser) { openLoginModal(); return; }
  const text = $('#reply-input').value.trim();
  if (!text) return;
  state.replies.push({
    id: uid('r'),
    threadId: currentThreadId,
    authorId: state.currentUser.id,
    createdAt: Date.now(),
    body: text,
    votes: 0,
    voters: {},
  });
  saveState(state);
  $('#reply-input').value = '';
  renderThread();
});

function renderAnnouncements() {
  const list = [...state.announcements].sort((a,b) => b.createdAt - a.createdAt);
  $('#ann-list').innerHTML = list.map(a => `
    <div class="ann-card">
      <span class="ann-date">${fmtDate(a.createdAt)}</span>
      <h3>${escapeHTML(a.title)}</h3>
      <div class="ann-body">${escapeHTML(a.body)}</div>
    </div>
  `).join('') || emptyState('No announcements', 'Post an update when there is something worth pinning.', 'Post announcement');

  $('#ann-list .empty-action')?.addEventListener('click', openNewAnnouncementModal);
}

function renderLeaderboard() {
  const rep = computeReputation(state);
  const rows = state.users
    .map(u => ({ ...u, score: rep[u.id] || 0 }))
    .filter(u => u.score > 0)
    .sort((a,b) => b.score - a.score);

  $('#leaderboard-table').innerHTML = `
    <thead><tr><th>Rank</th><th>User</th><th>Reputation</th></tr></thead>
    <tbody>
      ${rows.map((u, i) => `
        <tr>
          <td class="rank-num">${i + 1}</td>
          <td class="rank-name-cell">${escapeHTML(u.name)}</td>
          <td class="rank-score-cell">${u.score}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="table-empty">No reputation yet.</td></tr>'}
    </tbody>
  `;
}

function openLoginModal() {
  openModal('Sign in', `
    <label for="login-name">Username</label>
    <input id="login-name" placeholder="max" value="${state.currentUser ? escapeHTML(state.currentUser.name) : ''}" />
    <p class="form-note">No password. Your account is stored locally in this browser.</p>
    <button class="cta" id="login-go">Sign in</button>
  `);
  setTimeout(() => $('#login-name')?.focus(), 50);
  $('#login-go').onclick = () => {
    const name = $('#login-name').value.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) return;
    let user = state.users.find(u => u.name === name);
    if (!user) {
      user = { id: uid('u'), name };
      state.users.push(user);
    }
    state.currentUser = { id: user.id, name: user.name };
    saveState(state);
    refreshUserBadge();
    closeModal();
    go(currentRoute, { threadId: currentThreadId });
  };
}

function refreshUserBadge() {
  if (state.currentUser) {
    $('#user-badge').textContent = state.currentUser.name;
    $('#login-btn').textContent = 'Sign out';
  } else {
    $('#user-badge').textContent = 'Guest';
    $('#login-btn').textContent = 'Sign in';
  }
}

$('#login-btn').addEventListener('click', () => {
  if (state.currentUser) {
    state.currentUser = null;
    saveState(state);
    refreshUserBadge();
    go(currentRoute, { threadId: currentThreadId });
  } else {
    openLoginModal();
  }
});

function openNewThreadModal() {
  if (!state.currentUser) { openLoginModal(); return; }
  openModal('New thread', `
    <label for="nt-title">Title</label>
    <input id="nt-title" placeholder="What should people discuss?" />
    <label for="nt-tag">Tag</label>
    <input id="nt-tag" placeholder="General" />
    <label for="nt-body">Body</label>
    <textarea id="nt-body" placeholder="Write the opening post..."></textarea>
    <button class="cta" id="nt-submit">Post thread</button>
  `);
  $('#nt-submit').onclick = () => {
    const title = $('#nt-title').value.trim();
    const tag = $('#nt-tag').value.trim() || 'General';
    const body = $('#nt-body').value.trim();
    if (!title || !body) return;
    const t = {
      id: uid('t'),
      title,
      tag,
      authorId: state.currentUser.id,
      createdAt: Date.now(),
      body,
      votes: 0,
      voters: {},
    };
    state.threads.push(t);
    saveState(state);
    closeModal();
    go('thread', { threadId: t.id });
  };
}

function openNewAnnouncementModal() {
  if (!state.currentUser) { openLoginModal(); return; }
  openModal('Post announcement', `
    <label for="na-title">Title</label>
    <input id="na-title" placeholder="Announcement title" />
    <label for="na-body">Body</label>
    <textarea id="na-body" placeholder="Details..."></textarea>
    <button class="cta" id="na-submit">Publish</button>
  `);
  $('#na-submit').onclick = () => {
    const title = $('#na-title').value.trim();
    const body = $('#na-body').value.trim();
    if (!title || !body) return;
    state.announcements.push({
      id: uid('a'),
      createdAt: Date.now(),
      title,
      body,
    });
    saveState(state);
    closeModal();
    go('announcements');
  };
}

$('#new-thread-btn').addEventListener('click', openNewThreadModal);
$('#hero-new-thread').addEventListener('click', openNewThreadModal);
$('#new-ann-btn').addEventListener('click', openNewAnnouncementModal);

function openModal(title, bodyHTML) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal').hidden = false;
}

function closeModal() {
  $('#modal').hidden = true;
  $('#modal-body').innerHTML = '';
}

$('.modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

$('#reset-data').addEventListener('click', () => {
  if (!confirm('Reset KillVolute local data?')) return;
  resetState();
  state = loadState();
  refreshUserBadge();
  go('home');
});

$('#today-date').textContent = fmtToday();
$('#year').textContent = new Date().getFullYear();
refreshUserBadge();
go('home');
