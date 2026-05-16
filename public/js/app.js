/* =========================================================
   app.js  —  KillVolute SPA (server-backed)
   ========================================================= */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const CATEGORY_META = {
  Announcements: { color: '#d83b53', description: 'Official notices and staff updates.' },
  Suggestions:   { color: '#3484f0', description: 'Ideas, feedback, and proposals.' },
  General:       { color: '#8d5cf6', description: 'Open conversation for everything else.' },
  'Bug Reports': { color: '#18a46f', description: 'Issues, defects, and broken behavior.' },
};

function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function rankChipHTML(rankKey) {
  const r = rankFor(rankKey || 'member');
  if (r.key === 'member') return '';
  return `<span class="rank-chip rank-${r.key}" title="${escapeHTML(r.label)}">${escapeHTML(r.label)}</span>`;
}

function authorHTML(name, rankKey) {
  return `<strong>${escapeHTML(name)}</strong>${rankChipHTML(rankKey)}`;
}

function canEditPost(post) {
  if (!currentUser) return false;
  if (post.authorId === currentUser.id) return true;
  return canModerate(currentUser.rank);
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
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function metaForCategory(name) {
  return CATEGORY_META[name] || CATEGORY_META.General;
}

/* ----- Topic table renderer ----- */

function emptyTopicTable(title, body, actionText) {
  return `
    <div class="topic-table-head">
      <span>Topic</span><span>Replies</span><span>Views</span><span>Activity</span>
    </div>
    <div class="empty-state">
      <span class="empty-mark">K</span>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(body)}</p>
      ${actionText ? `<button class="primary-btn empty-action">${escapeHTML(actionText)}</button>` : ''}
    </div>
  `;
}

function topicRowHTML(t) {
  const meta = metaForCategory(t.category);
  return `
    <div class="topic-row" data-thread="${t.id}">
      <div class="topic-main">
        <div class="topic-title-line">
          <span class="topic-cat" style="--cat:${meta.color}">${escapeHTML(t.category)}</span>
          <span class="topic-title">${escapeHTML(t.title)}</span>
        </div>
        <div class="topic-meta">${authorHTML(t.authorName, t.authorRank)} &middot; ${timeAgo(t.createdAt)}</div>
      </div>
      <div class="topic-num">${t.replyCount ?? 0}</div>
      <div class="topic-num">${t.views ?? 0}</div>
      <div class="topic-num activity">${timeAgo(t.createdAt)}</div>
    </div>
  `;
}

function topicTable(items, emptyTitle, emptyBody, actionText) {
  if (!items || !items.length) return emptyTopicTable(emptyTitle, emptyBody, actionText);
  return `
    <div class="topic-table-head">
      <span>Topic</span><span>Replies</span><span>Views</span><span>Activity</span>
    </div>
    ${items.map(topicRowHTML).join('')}
  `;
}

function wireTopicRows(scope) {
  $$('.topic-row', scope).forEach(row => {
    row.onclick = () => go('thread', { threadId: row.dataset.thread });
  });
}

/* ----- Router ----- */

let currentRoute = 'home';
let currentThreadId = null;
const VALID_ROUTES = ['home', 'latest', 'filter', 'thread', 'announcements', 'leaderboard', 'badges', 'staff', 'about'];

function normalizeRoute(r) {
  return VALID_ROUTES.includes(r) ? r : 'home';
}

function go(route, opts = {}) {
  currentRoute = normalizeRoute(route);
  if (opts.threadId) currentThreadId = opts.threadId;

  $$('.view').forEach(v => v.hidden = (v.dataset.view !== currentRoute));
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === currentRoute));

  window.scrollTo({ top: 0, behavior: 'instant' });
  renderCurrentRoute();
}

document.addEventListener('click', e => {
  const link = e.target.closest('[data-route]');
  if (link) {
    e.preventDefault();
    go(link.dataset.route);
  }
});

function renderCurrentRoute() {
  switch (currentRoute) {
    case 'home':           return renderHome();
    case 'latest':         return renderDiscussions();
    case 'filter':         return renderFilter();
    case 'thread':         return renderThread();
    case 'announcements':  return renderAnnouncements();
    case 'leaderboard':    return renderLeaderboard();
    case 'badges':         return renderBadges();
    case 'staff':          return renderStaff();
    case 'about':          return renderAbout();
  }
}

/* ----- Views ----- */

async function renderHome() {
  // Announcements
  try {
    const { announcements } = await API.listAnnouncements();
    const top4 = announcements.slice(0, 4).map(a => ({
      id: a.id, title: a.title, body: a.body, category: 'Announcements',
      authorName: a.authorName, createdAt: a.createdAt, replyCount: 0, views: 0,
    }));
    $('#home-announcements').innerHTML = topicTable(top4, 'No announcements yet.', 'Staff posts will appear here.');
    wireTopicRows($('#home-announcements'));
  } catch (e) {
    $('#home-announcements').innerHTML = emptyTopicTable('Could not load.', e.message);
  }

  // Recent threads
  try {
    const { threads } = await API.listThreads({ sort: 'recent' });
    $('#home-recent').innerHTML = topicTable(threads.slice(0, 8), 'No topics yet.', 'Be the first.', 'Create one');
    wireTopicRows($('#home-recent'));
    $$('.empty-action', $('#home-recent')).forEach(b => b.onclick = openNewThreadModal);
  } catch (e) {
    $('#home-recent').innerHTML = emptyTopicTable('Could not load.', e.message);
  }
}

async function renderDiscussions() {
  const q = $('#search-input').value || '';
  const sort = $('#sort-select').value || 'recent';
  try {
    const { threads } = await API.listThreads({ q, sort });
    $('#thread-list').innerHTML = topicTable(threads, 'No topics yet.', 'Start the first discussion.', 'Create one');
    wireTopicRows($('#thread-list'));
    $$('.empty-action', $('#thread-list')).forEach(b => b.onclick = openNewThreadModal);
  } catch (e) {
    $('#thread-list').innerHTML = emptyTopicTable('Could not load.', e.message);
  }
}

async function renderFilter() {
  const category = $('#category-filter').value || '';
  const q = $('#filter-search').value || '';
  const sort = $('#filter-sort').value || 'recent';
  try {
    const { threads } = await API.listThreads({ q, sort, category });
    $('#filter-results').innerHTML = topicTable(threads, 'Nothing matches.', 'Try a different filter.');
    wireTopicRows($('#filter-results'));
  } catch (e) {
    $('#filter-results').innerHTML = emptyTopicTable('Could not load.', e.message);
  }
}

async function renderThread() {
  if (!currentThreadId) {
    $('#thread-detail').innerHTML = '<p class="form-error">No thread selected.</p>';
    return;
  }
  try {
    const { thread, replies } = await API.getThread(currentThreadId);
    const meta = metaForCategory(thread.category);
    const canEdit = canEditPost(thread);
    const editedMark = thread.editedAt ? `<span class="edited-mark">(edited)</span>` : '';

    $('#thread-detail').innerHTML = `
      <div class="meta-row">
        <span class="cat-chip" style="--cat:${meta.color}">${escapeHTML(thread.category)}</span>
        <span>${thread.views} views &middot; ${replies.length} replies</span>
      </div>
      <h2>${escapeHTML(thread.title)}</h2>
      <div class="author-line">${authorHTML(thread.authorName, thread.authorRank)} &middot; ${fmtDate(thread.createdAt)} (${timeAgo(thread.createdAt)})${editedMark}
        ${canEdit ? `
          <span class="post-actions">
            <button class="text-btn" data-edit="thread" data-id="${thread.id}">Edit</button>
            <button class="text-btn danger" data-delete="thread" data-id="${thread.id}">Delete</button>
          </span>
        ` : ''}
      </div>
      <div class="body">${escapeHTML(thread.body)}</div>
      <div class="vote-bar">
        <button class="vote-btn ${thread.userVote === 1 ? 'active' : ''}" data-vote="up"   data-target="thread" data-id="${thread.id}">&#9650;</button>
        <span class="vote-score" data-score-for="${thread.id}">${thread.votes}</span>
        <button class="vote-btn ${thread.userVote === -1 ? 'active' : ''}" data-vote="down" data-target="thread" data-id="${thread.id}">&#9660;</button>
      </div>
    `;

    $('#replies-list').innerHTML = replies.length ? replies.map(r => {
      const rCanEdit = canEditPost(r);
      const rEdited = r.editedAt ? `<span class="edited-mark">(edited)</span>` : '';
      return `
        <div class="reply" data-reply="${r.id}">
          <div class="meta">${authorHTML(r.authorName, r.authorRank)} &middot; ${timeAgo(r.createdAt)}${rEdited}
            ${rCanEdit ? `
              <span class="post-actions">
                <button class="text-btn" data-edit="reply" data-id="${r.id}">Edit</button>
                <button class="text-btn danger" data-delete="reply" data-id="${r.id}">Delete</button>
              </span>
            ` : ''}
          </div>
          <div class="body">${escapeHTML(r.body)}</div>
          <div class="vote-bar">
            <button class="vote-btn ${r.userVote === 1 ? 'active' : ''}" data-vote="up"   data-target="reply" data-id="${r.id}">&#9650;</button>
            <span class="vote-score" data-score-for="${r.id}">${r.votes}</span>
            <button class="vote-btn ${r.userVote === -1 ? 'active' : ''}" data-vote="down" data-target="reply" data-id="${r.id}">&#9660;</button>
          </div>
        </div>
      `;
    }).join('') : '<p style="color:var(--muted); padding:12px 0;">No replies yet.</p>';

    $$('.vote-btn').forEach(b => {
      b.onclick = () => handleVote(b.dataset.target, b.dataset.id, b.dataset.vote === 'up' ? 1 : -1);
    });
    $$('[data-edit]').forEach(b => {
      b.onclick = () => openEditModal(b.dataset.edit, b.dataset.id, thread, replies);
    });
    $$('[data-delete]').forEach(b => {
      b.onclick = () => handleDelete(b.dataset.delete, b.dataset.id);
    });
  } catch (e) {
    $('#thread-detail').innerHTML = `<p class="form-error">${escapeHTML(e.message)}</p>`;
    $('#replies-list').innerHTML = '';
  }
}

function openEditModal(kind, id, thread, replies) {
  if (kind === 'thread') {
    const t = thread;
    openModal('Edit Topic', `
      <label for="et-title">Title</label>
      <input id="et-title" value="${escapeHTML(t.title)}" />
      <label for="et-body">Body</label>
      <textarea id="et-body">${escapeHTML(t.body)}</textarea>
      <div id="et-msg"></div>
      <button class="primary-btn" id="et-save">Save</button>
    `);
    setTimeout(() => $('#et-title')?.focus(), 20);
    $('#et-save').onclick = async () => {
      const title = $('#et-title').value.trim();
      const body  = $('#et-body').value.trim();
      try {
        await API.editThread(id, { title, body });
        closeModal();
        toast('Topic updated');
        renderThread();
      } catch (e) {
        $('#et-msg').innerHTML = `<div class="form-error">${escapeHTML(e.message)}</div>`;
      }
    };
  } else {
    const r = replies.find(x => x.id === id);
    if (!r) return;
    openModal('Edit Reply', `
      <label for="er-body">Body</label>
      <textarea id="er-body">${escapeHTML(r.body)}</textarea>
      <div id="er-msg"></div>
      <button class="primary-btn" id="er-save">Save</button>
    `);
    setTimeout(() => $('#er-body')?.focus(), 20);
    $('#er-save').onclick = async () => {
      const body = $('#er-body').value.trim();
      try {
        await API.editReply(id, body);
        closeModal();
        toast('Reply updated');
        renderThread();
      } catch (e) {
        $('#er-msg').innerHTML = `<div class="form-error">${escapeHTML(e.message)}</div>`;
      }
    };
  }
}

async function handleDelete(kind, id) {
  const what = kind === 'thread' ? 'topic' : 'reply';
  if (!confirm(`Delete this ${what}? This cannot be undone.`)) return;
  try {
    if (kind === 'thread') {
      await API.deleteThread(id);
      toast('Topic deleted');
      go('latest');
    } else {
      await API.deleteReply(id);
      toast('Reply deleted');
      renderThread();
    }
  } catch (e) {
    toast(e.message || 'Delete failed');
  }
}

async function handleVote(kind, id, delta) {
  if (!currentUser) { toast('Sign in to vote'); openLoginModal('signin'); return; }
  // figure out next value (toggle off if same vote)
  const btn = $(`.vote-btn[data-id="${id}"][data-vote="${delta === 1 ? 'up' : 'down'}"]`);
  const wasActive = btn?.classList.contains('active');
  const next = wasActive ? 0 : delta;
  try {
    const res = await API.vote(kind, id, next);
    const scoreEl = $(`[data-score-for="${id}"]`);
    if (scoreEl) scoreEl.textContent = res.votes;
    $$(`.vote-btn[data-id="${id}"]`).forEach(b => {
      const isUp = b.dataset.vote === 'up';
      b.classList.toggle('active', (isUp && res.userVote === 1) || (!isUp && res.userVote === -1));
    });
  } catch (e) {
    toast(e.message || 'Vote failed');
  }
}

async function renderAnnouncements() {
  // Show "New Announcement" button only for Lead Mod+
  const newAnnBtn = $('#new-ann-btn');
  if (newAnnBtn) {
    newAnnBtn.hidden = !currentUser || !canPostAnnouncement(currentUser.rank);
  }

  try {
    const { announcements } = await API.listAnnouncements();
    if (!announcements.length) {
      $('#ann-list').innerHTML = `
        <div class="topic-table-head">
          <span>Announcement</span><span>Author</span><span>Date</span><span></span>
        </div>
        <div class="empty-state">
          <span class="empty-mark">K</span>
          <h3>No announcements yet.</h3>
          <p>Staff posts will appear here.</p>
        </div>`;
      return;
    }

    $('#ann-list').innerHTML = `
      <div class="topic-table-head" style="grid-template-columns:1fr 160px 120px 80px">
        <span>Announcement</span><span>Author</span><span>Date</span><span></span>
      </div>
      ${announcements.map(a => {
        const canEdit   = currentUser && canEditAnnouncement(currentUser.rank);
        const canDelete = currentUser && canDeleteAnnouncement(currentUser.rank);
        const editedMark = a.editedAt ? `<span class="edited-mark">(edited)</span>` : '';
        return `
          <div class="ann-row" style="
            display:grid;
            grid-template-columns:1fr 160px 120px 80px;
            gap:0;
            padding:10px 12px;
            border-bottom:1px solid var(--line);
            align-items:center;
          ">
            <div>
              <div style="font-weight:600;font-size:13px;margin-bottom:2px">
                ${escapeHTML(a.title)}${editedMark}
              </div>
              <div style="font-size:11px;color:var(--muted)">
                ${escapeHTML(a.body.slice(0, 120))}${a.body.length > 120 ? '…' : ''}
              </div>
            </div>
            <div style="font-size:12px">${authorHTML(a.authorName, a.authorRank)}</div>
            <div style="font-size:11px;color:var(--muted)">${fmtDate(a.createdAt)}</div>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              ${canEdit   ? `<button class="text-btn" data-edit-ann="${a.id}">Edit</button>` : ''}
              ${canDelete ? `<button class="text-btn danger" data-delete-ann="${a.id}">Delete</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    `;

    $$('[data-edit-ann]').forEach(btn => {
      const ann = announcements.find(a => a.id === btn.dataset.editAnn);
      btn.onclick = () => openEditAnnouncementModal(ann);
    });

    $$('[data-delete-ann]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this announcement? Cannot be undone.')) return;
        try {
          await API.deleteAnnouncement(btn.dataset.deleteAnn);
          toast('Announcement deleted');
          renderAnnouncements();
        } catch (e) { toast(e.message || 'Delete failed'); }
      };
    });
  } catch (e) {
    $('#ann-list').innerHTML = `<div class="empty-state"><h3>Could not load</h3><p>${escapeHTML(e.message)}</p></div>`;
  }
}

function openEditAnnouncementModal(ann) {
  openModal('Edit Announcement', `
    <label for="ea-title">Title</label>
    <input id="ea-title" value="${escapeHTML(ann.title)}" />
    <label for="ea-body">Body</label>
    <textarea id="ea-body">${escapeHTML(ann.body)}</textarea>
    <div id="ea-msg"></div>
    <button class="primary-btn" id="ea-save">Save</button>
  `);
  setTimeout(() => $('#ea-title')?.focus(), 20);
  $('#ea-save').onclick = async () => {
    const title = $('#ea-title').value.trim();
    const body  = $('#ea-body').value.trim();
    if (!title || !body) {
      $('#ea-msg').innerHTML = `<div class="form-error">Title and body required.</div>`;
      return;
    }
    $('#ea-save').textContent = '...';
    try {
      await API.editAnnouncement(ann.id, { title, body });
      closeModal();
      toast('Announcement updated');
      renderAnnouncements();
    } catch (e) {
      $('#ea-save').textContent = 'Save';
      $('#ea-msg').innerHTML = `<div class="form-error">${escapeHTML(e.message)}</div>`;
    }
  };
}

async function renderLeaderboard() {
  try {
    const { users } = await API.leaderboard();
    const rows = users.filter(u => u.score > 0);
    $('#leaderboard-table').innerHTML = `
      <thead><tr><th>Rank</th><th>User</th><th style="text-align:right">Reputation</th></tr></thead>
      <tbody>
        ${rows.map((u, i) => `
          <tr>
            <td class="rank-num">${String(i + 1).padStart(2, '0')}</td>
            <td class="rank-name-cell">${escapeHTML(u.name)}${rankChipHTML(u.rank)}</td>
            <td class="rank-score-cell">${u.score}</td>
          </tr>
        `).join('') || `<tr><td colspan="3" style="padding:24px;color:var(--muted);text-align:center">No reputation accumulated yet.</td></tr>`}
      </tbody>
    `;
  } catch (e) {
    $('#leaderboard-table').innerHTML = `<tbody><tr><td style="color:var(--accent)">${escapeHTML(e.message)}</td></tr></tbody>`;
  }
}

function renderBadges() {
  const badges = [
    { name: 'Welcome',        desc: 'Created an account.' },
    { name: 'First Post',     desc: 'Posted your first topic.' },
    { name: 'First Reply',    desc: 'Replied to a thread.' },
    { name: 'Reputation +10', desc: 'Earned 10 reputation points.' },
    { name: 'Reputation +50', desc: 'Earned 50 reputation points.' },
    { name: 'Reputation +100',desc: 'Earned 100 reputation points.' },
  ];
  $('#badges-grid').innerHTML = badges.map(b => `
    <div class="badge-card">
      <h3><span class="badge-dot"></span>${escapeHTML(b.name)}</h3>
      <p>${escapeHTML(b.desc)}</p>
    </div>
  `).join('');
}

async function renderStaff() {
  try {
    const { staff } = await API.staff();
    if (!staff.length) {
      $('#staff-list').innerHTML = `<div class="empty-state" style="padding:30px"><h3>No staff yet</h3><p>Promote users from the admin panel.</p></div>`;
      return;
    }
    // group by rank, in rank order
    const grouped = {};
    staff.forEach(u => {
      (grouped[u.rank] ||= []).push(u);
    });
    const html = RANKS
      .filter(r => r.key !== 'member' && grouped[r.key]?.length)
      .map(r => `
        <div class="staff-group">
          <div class="staff-group-head">
            <span class="rank-badge rank-${r.key}">${escapeHTML(r.label)}</span>
            <h3 style="color:var(--muted)">${grouped[r.key].length} ${grouped[r.key].length === 1 ? 'member' : 'members'}</h3>
          </div>
          ${grouped[r.key].map(u => `
            <div class="staff-row">
              <span class="staff-name">${escapeHTML(u.name)}</span>
              <span class="staff-since">Joined ${fmtDate(u.createdAt)}</span>
            </div>
          `).join('')}
        </div>
      `).join('');
    $('#staff-list').innerHTML = html;
  } catch (e) {
    $('#staff-list').innerHTML = `<div class="empty-state"><h3>Could not load</h3><p>${escapeHTML(e.message)}</p></div>`;
  }
}

/* ----- Admin panel ----- */

async function openAdminPanel() {
  if (!currentUser || !canPromoteOthers(currentUser.rank)) {
    toast('Admin access required'); return;
  }
  openModal('Admin Panel', `
    <input id="admin-search" class="admin-search" placeholder="Search users..." />
    <div id="admin-user-list" class="admin-user-list">Loading...</div>
  `);
  document.querySelector('.modal-card')?.classList.add('admin-panel');

  let timer = null;
  $('#admin-search').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => loadAdminUsers(e.target.value), 200);
  });
  setTimeout(() => $('#admin-search')?.focus(), 30);
  loadAdminUsers('');
}

async function loadAdminUsers(q) {
  try {
    const { users } = await API.listUsers(q);
    if (!users.length) {
      $('#admin-user-list').innerHTML = `<div style="padding:18px;color:var(--muted);text-align:center">No users match.</div>`;
      return;
    }
    $('#admin-user-list').innerHTML = users.map(u => {
      const canChange = currentUser.rank === 'owner' ||
        (rankLevel(currentUser.rank) > rankLevel(u.rank));
      const options = RANKS
        .filter(r => canAssignRank(currentUser.rank, r.key) || r.key === u.rank)
        .map(r => `<option value="${r.key}" ${u.rank === r.key ? 'selected' : ''}>${escapeHTML(r.label)}</option>`)
        .join('');
      return `
        <div class="admin-user-row" data-user="${u.id}">
          <span class="admin-user-name">
            ${escapeHTML(u.name)}${rankChipHTML(u.rank)}
          </span>
          <select data-rank-select="${u.id}" ${canChange ? '' : 'disabled'}>${options}</select>
          <button class="save-btn" data-save="${u.id}" ${canChange ? '' : 'disabled'}>Save</button>
        </div>
      `;
    }).join('');

    $$('[data-save]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.save;
        const sel = $(`[data-rank-select="${id}"]`);
        const newRank = sel.value;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          await API.setUserRank(id, newRank);
          toast('Rank updated');
          loadAdminUsers($('#admin-search').value);
          // If we changed our own rank, refresh me
          if (id === currentUser.id) {
            const { user } = await API.me();
            currentUser = user;
            refreshUserBadge();
          }
        } catch (e) {
          toast(e.message || 'Failed');
          btn.disabled = false;
          btn.textContent = 'Save';
        }
      };
    });
  } catch (e) {
    $('#admin-user-list').innerHTML = `<div style="padding:18px;color:var(--accent)">${escapeHTML(e.message)}</div>`;
  }
}

$('#admin-btn')?.addEventListener('click', openAdminPanel);

async function renderAbout() {
  try {
    const s = await API.stats();
    $('#about-topic-count').textContent = s.threads;
    $('#about-user-count').textContent  = s.users;
    $('#about-reply-count').textContent = s.replies;
  } catch (e) {
    $('#about-topic-count').textContent = '?';
  }
}

/* ----- Modals: New thread / new announcement ----- */

function openNewThreadModal() {
  if (!currentUser) { toast('Sign in to post'); openLoginModal('signin'); return; }
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
    <div id="nt-msg"></div>
    <button class="primary-btn" id="nt-submit">Create Topic</button>
  `);
  setTimeout(() => $('#nt-title')?.focus(), 20);

  $('#nt-submit').onclick = async () => {
    const title = $('#nt-title').value.trim();
    const body  = $('#nt-body').value.trim();
    const category = $('#nt-tag').value;
    if (!title || !body) {
      $('#nt-msg').innerHTML = `<div class="form-error">Title and body required.</div>`;
      return;
    }
    $('#nt-submit').textContent = '...';
    try {
      const { thread } = await API.createThread({ title, body, category });
      closeModal();
      toast('Topic created');
      go('thread', { threadId: thread.id });
    } catch (e) {
      $('#nt-submit').textContent = 'Create Topic';
      $('#nt-msg').innerHTML = `<div class="form-error">${escapeHTML(e.message)}</div>`;
    }
  };
}

function openNewAnnouncementModal() {
  if (!currentUser) { toast('Sign in to post'); openLoginModal('signin'); return; }
  if (!canPostAnnouncement(currentUser.rank)) { toast('Lead Moderator or above required'); return; }
  openModal('New Announcement', `
    <label for="na-title">Title</label>
    <input id="na-title" placeholder="Announcement title" />
    <label for="na-body">Body</label>
    <textarea id="na-body" placeholder="Details..."></textarea>
    <div id="na-msg"></div>
    <button class="primary-btn" id="na-submit">Publish</button>
  `);
  setTimeout(() => $('#na-title')?.focus(), 20);

  $('#na-submit').onclick = async () => {
    const title = $('#na-title').value.trim();
    const body  = $('#na-body').value.trim();
    if (!title || !body) {
      $('#na-msg').innerHTML = `<div class="form-error">Title and body required.</div>`;
      return;
    }
    $('#na-submit').textContent = '...';
    try {
      await API.createAnnouncement(title, body);
      closeModal();
      toast('Announcement published');
      go('announcements');
    } catch (e) {
      $('#na-submit').textContent = 'Publish';
      $('#na-msg').innerHTML = `<div class="form-error">${escapeHTML(e.message)}</div>`;
    }
  };
}

/* ----- Reply form ----- */

$('#reply-submit')?.addEventListener('click', async () => {
  if (!currentUser) { toast('Sign in to reply'); openLoginModal('signin'); return; }
  const text = $('#reply-input').value.trim();
  if (!text) return;
  try {
    await API.createReply(currentThreadId, text);
    $('#reply-input').value = '';
    toast('Reply posted');
    renderThread();
  } catch (e) {
    toast(e.message || 'Reply failed');
  }
});

/* ----- New thread / announcement buttons ----- */

$('#new-thread-btn')?.addEventListener('click', openNewThreadModal);
$('#hero-new-thread')?.addEventListener('click', openNewThreadModal);
$('#filter-new-thread')?.addEventListener('click', openNewThreadModal);
$('#new-ann-btn')?.addEventListener('click', openNewAnnouncementModal);

/* ----- Filter inputs ----- */

$('#search-input')?.addEventListener('input', () => { if (currentRoute === 'latest') renderDiscussions(); });
$('#sort-select')?.addEventListener('change', () => { if (currentRoute === 'latest') renderDiscussions(); });

$('#category-filter')?.addEventListener('change', () => { if (currentRoute === 'filter') renderFilter(); });
$('#filter-search')?.addEventListener('input', () => { if (currentRoute === 'filter') renderFilter(); });
$('#filter-sort')?.addEventListener('change', () => { if (currentRoute === 'filter') renderFilter(); });

/* ----- Modal helpers ----- */

function openModal(title, bodyHTML) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modal-body').innerHTML = '';
}
$('.modal-close')?.addEventListener('click', closeModal);
$('#modal')?.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ----- Login / Sign-up buttons ----- */

$('#login-btn').addEventListener('click', () => {
  if (currentUser) doSignOut();
  else openLoginModal('signin');
});
$('#signup-btn')?.addEventListener('click', () => openLoginModal('signup'));

/* ----- Reset button (just clears the cookie locally) ----- */

$('#reset-data')?.addEventListener('click', async () => {
  if (!confirm('Sign out and clear local session?')) return;
  await doSignOut();
});

/* ----- Storage status (now shows server connectivity) ----- */

async function updateStorageStatus() {
  const el = $('#storage-status');
  if (!el) return;
  try {
    const r = await fetch('/api/health');
    el.textContent = r.ok ? 'Server connected' : 'Server unreachable';
  } catch (_) {
    el.textContent = 'Server unreachable';
  }
}

/* ----- Boot ----- */

function routeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const queryRoute = params.get('route');
  if (queryRoute) return normalizeRoute(queryRoute);
  return 'home';
}

(async function boot() {
  await initAuthFromServer();
  updateStorageStatus();
  go(routeFromLocation());
})();
