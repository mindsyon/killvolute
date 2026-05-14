/* =========================================================
   data.js - empty seed data + storage layer
   ========================================================= */

const STORAGE_KEY = 'killvolute.v1';
const SERVER_STORAGE_URL = window.KILLVOLUTE_STORAGE_URL || '';

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
  syncStateToServer(state);
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  syncStateToServer(freshSeed());
}

async function syncStateFromServer() {
  if (!SERVER_STORAGE_URL) return null;
  try {
    const res = await fetch(SERVER_STORAGE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const remoteState = await res.json();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
    return remoteState;
  } catch (e) {
    console.warn('Server sync load failed, using local data', e);
    return null;
  }
}

async function syncStateToServer(nextState) {
  if (!SERVER_STORAGE_URL) return;
  try {
    await fetch(SERVER_STORAGE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextState),
    });
  } catch (e) {
    console.warn('Server sync save failed, keeping local data', e);
  }
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
