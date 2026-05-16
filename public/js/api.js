/* =========================================================
   api.js  —  fetch wrapper for the KillVolute backend
   ========================================================= */

const API = (() => {
  async function request(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    // auth
    me:       ()           => request('/api/me'),
    signUp:   (name, password) => request('/api/signup', { method: 'POST', body: { name, password } }),
    signIn:   (name, password) => request('/api/signin', { method: 'POST', body: { name, password } }),
    signOut:  ()           => request('/api/signout', { method: 'POST' }),

    // threads
    listThreads:  (q = {})    => {
      const params = new URLSearchParams();
      if (q.sort)     params.set('sort', q.sort);
      if (q.category) params.set('category', q.category);
      if (q.q)        params.set('q', q.q);
      const qs = params.toString();
      return request('/api/threads' + (qs ? '?' + qs : ''));
    },
    getThread:    (id)        => request('/api/threads/' + encodeURIComponent(id)),
    createThread: ({ title, body, category }) =>
      request('/api/threads', { method: 'POST', body: { title, body, category } }),
    editThread:   (id, patch) =>
      request('/api/threads/' + encodeURIComponent(id), { method: 'PATCH', body: patch }),
    deleteThread: (id) =>
      request('/api/threads/' + encodeURIComponent(id), { method: 'DELETE' }),
    createReply:  (threadId, body) =>
      request(`/api/threads/${encodeURIComponent(threadId)}/replies`, { method: 'POST', body: { body } }),
    editReply:    (id, body) =>
      request('/api/replies/' + encodeURIComponent(id), { method: 'PATCH', body: { body } }),
    deleteReply:  (id) =>
      request('/api/replies/' + encodeURIComponent(id), { method: 'DELETE' }),
    vote:         (kind, id, value) =>
      request('/api/vote', { method: 'POST', body: { kind, id, value } }),

    // announcements
    listAnnouncements:    ()           => request('/api/announcements'),
    createAnnouncement:   (title, body) =>
      request('/api/announcements', { method: 'POST', body: { title, body } }),
    editAnnouncement:     (id, patch)  =>
      request('/api/announcements/' + encodeURIComponent(id), { method: 'PATCH', body: patch }),
    deleteAnnouncement:   (id)         =>
      request('/api/announcements/' + encodeURIComponent(id), { method: 'DELETE' }),

    // users / stats / staff
    leaderboard: () => request('/api/leaderboard'),
    user:        (name) => request('/api/users/' + encodeURIComponent(name)),
    stats:       ()    => request('/api/stats'),
    staff:       ()    => request('/api/staff'),

    // admin
    listUsers:   (q = '') => request('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')),
    setUserRank: (id, rank) =>
      request('/api/admin/users/' + encodeURIComponent(id) + '/rank', { method: 'PATCH', body: { rank } }),
  };
})();
