/* =========================================================
   data.js - empty seed data + storage layer
   ========================================================= */

const STORAGE_KEY = 'killvolute.v1';

const SEED_DATA = {
  currentUser: null,
  users: [],
  threads: [],
  replies: [],
  announcements: [],
};

function freshSeed() {
  return JSON.parse(JSON.stringify(SEED_DATA));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = freshSeed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('loadState failed, reseeding', e);
    const seeded = freshSeed();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

function userById(state, id) {
  return state.users.find(u => u.id === id) || { id, name: 'unknown' };
}

function computeReputation(state) {
  const rep = {};
  state.users.forEach(u => { rep[u.id] = 0; });
  state.threads.forEach(t => { rep[t.authorId] = (rep[t.authorId] || 0) + (t.votes || 0); });
  state.replies.forEach(r => { rep[r.authorId] = (rep[r.authorId] || 0) + (r.votes || 0); });
  return rep;
}

function uid(prefix='id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}
