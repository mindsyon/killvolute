/* =========================================================
   app.js - lightweight Discourse-style forum behavior
   ========================================================= */

let state = loadState();

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const CATEGORY_META = {
  Announcements: { color: '#d83b53', description: 'Official notices and staff updates.' },
  Suggestions: { color: '#3484f0', description: 'Ideas, feedback, and community proposals.' },
  General: { color: '#8d5cf6', description: 'Open conversation for everything else.' },
  'Bug Reports': { color: '#18a46f', description: 'Issues, defects, and broken behavior.' },
};

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
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd';
  return Math.floor(d / 30) + 'mo';
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function metaForCategory(name) {
  return CATEGORY_META[name] || CATEGORY_META.General;
}

function normalizeCategory(value) {
  const clean = (value || '').trim();
  return clean || 'General';
}

function replyCount(threadId) {
  return state.replies.filter(r => r.threadId === threadId).length;
}

function fakeViews(item) {
  const seed = String(item.id || item.title || '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return Math.max(24, seed + Math.abs(item.votes || 0) * 17);
}

function avatarInitial(user) {
  return (user?.name || '?').slice(0, 1).toUpperCase();
}

function emptyTopicTable(title, body, actionText) {
  return `
    <div class="topic-table-head">
      <span>Topic</span>
      <span>Replies</span>
      <span>Views</span>
      <span>Activity</span>
    </div>
    <div class="empty-state">
      <span class="empty-mark">K</span>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(body)}</p>
      ${actionText ? `<button class="primary-btn empty-action">${escapeHTML(actionText)}</button>` : ''}
    </div>
  `;
}

function topicTable(items, emptyTitle, emptyBody, actionText) {
  if (!items.length) return emptyTopicTable(emptyTitle, emptyBody, actionText);

  return `
    <div class="topic-table-head">
      <span>Topic</span>
      <span>Replies</span>
      <span>Views</span>
      <span>Activity</span>
    </div>
    ${items.map(item => {
      const isAnnouncement = item.kind === 'announcement';
      const author = isAnnouncement ? { name: 'staff' } : userById(state, item.authorId);
      const category = isAnnouncement ? 'Announcements' : normalizeCategory(item.tag);
      const cat = metaForCategory(category);
      const replies = isAnnouncement ? 0 : replyCount(item.id);
      const views = fakeViews(item);
      return `
        <article class="topic-row" data-thread="${isAnnouncement ? '' : item.id}" data-kind="${isAnnouncement ? 'announcement' : 'thread'}">
          <div class="topic-main">
            <h3>${escapeHTML(item.title)}</h3>
            <div class="topic-meta">
              <span class="category-badge" style="--cat:${cat.color}">${escapeHTML(category)}</span>
              <span>${escapeHTML(cat.description)}</span>
            </div>
          </div>
          <div class="posters">
            <span class="avatar">${escapeHTML(avatarInitial(author))}</span>
          </div>
          <strong class="topic-stat">${replies}</strong>
          <strong class="topic-stat">${views}</strong>
          <time class="activity">${timeAgo(item.createdAt)}</time>
        </article>
      `;
    }).join('')}
  `;
}

let currentRoute = 'home';
let currentThreadId = null;

function normalizeRoute(route) {
  if (route === 'discussions') return 'latest';
  return route || 'home';
}

function go(route, opts={}) {
  route = normalizeRoute(route);
  currentRoute = route;
  if (opts.threadId) currentThreadId = opts.threadId;

  $$('.view').forEach(v => { v.hidden = v.dataset.view !== route; });
  $$('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (route === 'home') renderHome();
  else if (route === 'latest') renderDiscussions();
  else if (route === 'thread') renderThread();
  else if (route === 'announcements') renderAnnouncements();
  else if (route === 'leaderboard') renderLeaderboard();
  else if (route === 'filter') renderFilter();
  else if (route === 'badges') renderBadges();
  else if (route === 'about') renderAbout();
}

document.addEventListener('click', e => {
  const link = e.target.closest('[data-route]');
  if (!link) return;
  e.preventDefault();
  go(link.dataset.route);
});

function renderHome() {
  const announcements = [...state.announcements]
    .sort((a,b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .map(a => ({ ...a, kind: 'announcement' }));
  const recent = [...state.threads].sort((a,b) => b.createdAt - a.createdAt).slice(0, 20);

  $('#home-announcements').innerHTML = topicTable(
    announcements,
    'No announcements yet',
    'Official updates will appear here once you post one.',
    'New Announcement'
  );
  $('#home-recent').innerHTML = topicTable(
    recent,
    'No topics yet',
    'KillVolute is empty. Start the first topic to bring the forum online.',
    'New Topic'
  );

  $('#home-announcements .empty-action')?.addEventListener('click', openNewAnnouncementModal);
  $('#home-recent .empty-action')?.addEventListener('click', openNewThreadModal);
  wireTopicRows();
}

function renderDiscussions() {
  const globalQ = ($('#global-search')?.value || '').toLowerCase();
  const localQ = ($('#search-input')?.value || '').toLowerCase();
  const q = localQ || globalQ;
  const sort = $('#sort-select').value;

  let list = state.threads.slice();
  if (q) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      normalizeCategory(t.tag).toLowerCase().includes(q)
    );
  }

  if (sort === 'recent') list.sort((a,b) => b.createdAt - a.createdAt);
  else if (sort === 'top') list.sort((a,b) => replyCount(b.id) - replyCount(a.id));
  else if (sort === 'replies') list.sort((a,b) => fakeViews(b) - fakeViews(a));

  $('#thread-list').innerHTML = topicTable(
    list,
    q ? 'No matching topics' : 'No topics yet',
    q ? 'Try a different search or clear the filter.' : 'Make the first post and the topic list will fill from there.',
    q ? '' : 'New Topic'
  );

  $('#thread-list .empty-action')?.addEventListener('click', openNewThreadModal);
  wireTopicRows();
}

function wireTopicRows() {
  $$('.topic-row[data-kind="thread"]').forEach(row => {
    row.onclick = () => go('thread', { threadId: row.dataset.thread });
  });
}

$('#search-input').addEventListener('input', () => { if (currentRoute === 'latest') renderDiscussions(); });
$('#sort-select').addEventListener('change', () => { if (currentRoute === 'latest') renderDiscussions(); });
$('#global-search').addEventListener('input', () => {
  if (currentRoute !== 'latest') go('latest');
  else renderDiscussions();
});

function renderThread() {
  const t = state.threads.find(x => x.id === currentThreadId);
  if (!t) {
    $('#thread-detail').innerHTML = '<div class="empty-state"><h3>Thread not found</h3><p>This topic may have been reset.</p></div>';
    $('#replies-list').innerHTML = '';
    return;
  }

  const author = userById(state, t.authorId);
  const userVote = state.currentUser ? (t.voters[state.currentUser.id] || 0) : 0;
  const cat = metaForCategory(normalizeCategory(t.tag));

  $('#thread-detail').innerHTML = `
    <div class="topic-open-head">
      <span class="category-badge" style="--cat:${cat.color}">${escapeHTML(normalizeCategory(t.tag))}</span>
      <h1>${escapeHTML(t.title)}</h1>
      <p>By ${escapeHTML(author.name)} - ${fmtDate(t.createdAt)} - ${timeAgo(t.createdAt)} ago</p>
    </div>
    <div class="topic-post">
      <span class="avatar large">${escapeHTML(avatarInitial(author))}</span>
      <div class="topic-post-body">${escapeHTML(t.body)}</div>
    </div>
    <div class="vote-bar">
      <button class="secondary-btn vote-btn ${userVote === 1 ? 'active' : ''}" data-vote="up" data-target="thread" data-id="${t.id}">Upvote</button>
      <span class="vote-score">${t.votes}</span>
      <button class="secondary-btn vote-btn ${userVote === -1 ? 'active' : ''}" data-vote="down" data-target="thread" data-id="${t.id}">Downvote</button>
    </div>
  `;

  const replies = state.replies.filter(r => r.threadId === t.id).sort((a,b) => a.createdAt - b.createdAt);
  $('#replies-list').innerHTML = replies.map(r => {
    const ra = userById(state, r.authorId);
    const rv = state.currentUser ? (r.voters[state.currentUser.id] || 0) : 0;
    return `
      <article class="reply">
        <span class="avatar">${escapeHTML(avatarInitial(ra))}</span>
        <div>
          <div class="reply-meta"><strong>${escapeHTML(ra.name)}</strong> ${timeAgo(r.createdAt)} ago</div>
          <div class="reply-body">${escapeHTML(r.body)}</div>
          <div class="vote-bar small">
            <button class="secondary-btn vote-btn ${rv === 1 ? 'active' : ''}" data-vote="up" data-target="reply" data-id="${r.id}">Up</button>
            <span class="vote-score">${r.votes}</span>
            <button class="secondary-btn vote-btn ${rv === -1 ? 'active' : ''}" data-vote="down" data-target="reply" data-id="${r.id}">Down</button>
          </div>
        </div>
      </article>
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
  const list = [...state.announcements].sort((a,b) => b.createdAt - a.createdAt).map(a => ({ ...a, kind: 'announcement' }));
  $('#ann-list').innerHTML = topicTable(
    list,
    'No announcements yet',
    'Create the first official post for KillVolute.',
    'New Announcement'
  );
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
          <td>${i + 1}</td>
          <td>${escapeHTML(u.name)}</td>
          <td>${u.score}</td>
        </tr>
      `).join('') || '<tr><td colspan="3" class="table-empty">No reputation yet.</td></tr>'}
    </tbody>
  `;
}

function renderFilter() {
  const category = $('#category-filter').value;
  const q = ($('#filter-search').value || '').toLowerCase();
  const sort = $('#filter-sort').value;

  let list = state.threads.slice();
  if (category) list = list.filter(t => normalizeCategory(t.tag) === category);
  if (q) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      normalizeCategory(t.tag).toLowerCase().includes(q)
    );
  }

  if (sort === 'recent') list.sort((a,b) => b.createdAt - a.createdAt);
  else if (sort === 'views') list.sort((a,b) => fakeViews(b) - fakeViews(a));
  else if (sort === 'replies') list.sort((a,b) => replyCount(b.id) - replyCount(a.id));

  $('#filter-results').innerHTML = topicTable(
    list,
    'No filtered topics',
    'Change the filter or create a new topic in this category.',
    'New Topic'
  );
  $('#filter-results .empty-action')?.addEventListener('click', openNewThreadModal);
  wireTopicRows();
}

function renderBadges() {
  const rep = computeReputation(state);
  const topicCount = state.threads.length;
  const replyTotal = state.replies.length;
  const topScore = Math.max(0, ...Object.values(rep));
  const badges = [
    { name: 'First Signal', desc: 'Create the first topic.', earned: topicCount > 0 },
    { name: 'Signal Boost', desc: 'Reach 10 total replies.', earned: replyTotal >= 10 },
    { name: 'Crowd Pull', desc: 'Earn 25 reputation.', earned: topScore >= 25 },
    { name: 'Archivist', desc: 'Post an announcement.', earned: state.announcements.length > 0 },
    { name: 'Night Operator', desc: 'Keep the board active in dark mode.', earned: true },
    { name: 'Bug Hunter', desc: 'Open a Bug Reports topic.', earned: state.threads.some(t => normalizeCategory(t.tag) === 'Bug Reports') },
  ];

  $('#badges-grid').innerHTML = badges.map(b => `
    <article class="badge-card ${b.earned ? 'earned' : ''}">
      <span class="badge-glyph">${b.earned ? 'KV' : '--'}</span>
      <h2>${escapeHTML(b.name)}</h2>
      <p>${escapeHTML(b.desc)}</p>
      <strong>${b.earned ? 'Unlocked' : 'Locked'}</strong>
    </article>
  `).join('');
}

function renderAbout() {
  $('#about-topic-count').textContent = state.threads.length;
  $('#about-user-count').textContent = state.users.length;
  $('#about-reply-count').textContent = state.replies.length;
}

function renderCurrentRoute() {
  go(currentRoute, { threadId: currentThreadId });
}

function openLoginModal() {
  openModal('Log In', `
    <label for="login-name">Username</label>
    <input id="login-name" placeholder="username" value="${state.currentUser ? escapeHTML(state.currentUser.name) : ''}" />
    <p class="form-note">No password. This demo account is saved only in your browser.</p>
    <button class="primary-btn" id="login-go">Log In</button>
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
    $('#login-btn').textContent = 'Log Out';
  } else {
    $('#user-badge').textContent = 'Guest';
    $('#login-btn').textContent = 'Log In';
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
  openModal('New Topic', `
    <label for="nt-title">Title</label>
    <input id="nt-title" placeholder="Topic title" />
    <label for="nt-tag">Category</label>
    <select id="nt-tag">
      <option>Suggestions</option>
      <option>General</option>
      <option>Bug Reports</option>
      <option>Announcements</option>
    </select>
    <label for="nt-body">Body</label>
    <textarea id="nt-body" placeholder="Write the opening post..."></textarea>
    <button class="primary-btn" id="nt-submit">Create Topic</button>
  `);
  $('#nt-submit').onclick = () => {
    const title = $('#nt-title').value.trim();
    const tag = normalizeCategory($('#nt-tag').value);
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
  openModal('New Announcement', `
    <label for="na-title">Title</label>
    <input id="na-title" placeholder="Announcement title" />
    <label for="na-body">Body</label>
    <textarea id="na-body" placeholder="Details..."></textarea>
    <button class="primary-btn" id="na-submit">Publish</button>
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
$('#filter-new-thread').addEventListener('click', openNewThreadModal);
$('#new-ann-btn').addEventListener('click', openNewAnnouncementModal);
$('#category-filter').addEventListener('change', () => { if (currentRoute === 'filter') renderFilter(); });
$('#filter-search').addEventListener('input', () => { if (currentRoute === 'filter') renderFilter(); });
$('#filter-sort').addEventListener('change', () => { if (currentRoute === 'filter') renderFilter(); });

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

function routeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const queryRoute = params.get('route');
  if (queryRoute) return normalizeRoute(queryRoute);

  const path = window.location.pathname.replace(/\/+$/, '').split('/').pop();
  if (['latest', 'about', 'badges', 'filter'].includes(path)) return path;
  return 'home';
}

function updateStorageStatus() {
  const el = $('#storage-status');
  if (!el) return;
  el.textContent = SERVER_STORAGE_URL ? 'Server sync enabled' : 'Local storage';
}

refreshUserBadge();
updateStorageStatus();
go(routeFromLocation());

syncStateFromServer().then(remoteState => {
  if (!remoteState) return;
  state = remoteState;
  refreshUserBadge();
  renderCurrentRoute();
  updateStorageStatus();
});
