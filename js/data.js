/* =========================================================
   data.js  —  seed data + storage layer
   ========================================================= */

const STORAGE_KEY = 'theforum.v1';

const SEED_DATA = {
  // session
  currentUser: null, // { id, name } when logged in

  users: [
    { id: 'u_ada',   name: 'ada.lovelace' },
    { id: 'u_alan',  name: 'alan.turing' },
    { id: 'u_grace', name: 'grace.hopper' },
    { id: 'u_linus', name: 'linus.t' },
    { id: 'u_eevee', name: 'eevee' },
    { id: 'u_max',   name: 'max' },
    { id: 'u_anon',  name: 'anon_42' },
    { id: 'u_troll', name: 'plain_troll' },
  ],

  threads: [
    {
      id: 't1',
      title: 'On the slow death of personal websites',
      tag: 'Culture',
      authorId: 'u_ada',
      createdAt: Date.now() - 1000 * 60 * 60 * 6,
      body: `Once, every developer had a quirky homepage. Now we all live on the same five platforms. Is that progress, or just convenience?\n\nI'd like to hear arguments for both sides. What did we gain, and what did we lose when we stopped owning our corner of the web?`,
      votes: 47,
      voters: {},
    },
    {
      id: 't2',
      title: 'Why I rewrote my entire kernel project from scratch (again)',
      tag: 'Systems',
      authorId: 'u_linus',
      createdAt: Date.now() - 1000 * 60 * 60 * 26,
      body: `Third time this year. Started in C, moved to Rust, now back to C with a clearer head.\n\nThe lesson isn't about language choice. It's about how much of "starting over" is actually thinking properly for the first time.`,
      votes: 31,
      voters: {},
    },
    {
      id: 't3',
      title: 'Tabs vs spaces is a settled question',
      tag: 'Hot Take',
      authorId: 'u_troll',
      createdAt: Date.now() - 1000 * 60 * 60 * 50,
      body: `Tabs. It's tabs. Accessibility, configurability, semantic correctness — all on the side of tabs. Anyone still using spaces in 2026 is either nostalgic or stubborn.`,
      votes: -12,
      voters: {},
    },
    {
      id: 't4',
      title: 'Show your terminal setup',
      tag: 'Show & Tell',
      authorId: 'u_eevee',
      createdAt: Date.now() - 1000 * 60 * 60 * 72,
      body: `Drop your shell, prompt, color scheme, and one config you couldn't live without.\n\nI'll start: zsh + starship, Tokyo Night, and a custom git status segment that yells at me if I haven't committed in three hours.`,
      votes: 19,
      voters: {},
    },
    {
      id: 't5',
      title: 'A modest defense of writing things down',
      tag: 'Practice',
      authorId: 'u_grace',
      createdAt: Date.now() - 1000 * 60 * 60 * 110,
      body: `Every difficult problem I've ever solved was solved on paper first. Not on a whiteboard, not in a doc, not in code. On a page, with a pen, where I couldn't delete anything.\n\nThe permanence is the feature.`,
      votes: 88,
      voters: {},
    },
    {
      id: 't6',
      title: 'How do you keep learning when work demands shipping?',
      tag: 'Career',
      authorId: 'u_max',
      createdAt: Date.now() - 1000 * 60 * 60 * 9,
      body: `Honest question. Days fill up with tickets. Weekends I'm tired. The interesting things I want to build keep sliding to "later."\n\nWhat's worked for you?`,
      votes: 24,
      voters: {},
    },
  ],

  replies: [
    { id: 'r1', threadId: 't1', authorId: 'u_alan',  createdAt: Date.now() - 1000*60*60*5,  body: 'We gained reach and lost weirdness. The trade was never fair.', votes: 14, voters: {} },
    { id: 'r2', threadId: 't1', authorId: 'u_grace', createdAt: Date.now() - 1000*60*60*4,  body: 'Disagree slightly — the gatekeeping of "real" web development died. That was worth something.', votes: 8, voters: {} },
    { id: 'r3', threadId: 't2', authorId: 'u_eevee', createdAt: Date.now() - 1000*60*60*20, body: 'The rewrite is the thinking. Always has been.', votes: 11, voters: {} },
    { id: 'r4', threadId: 't3', authorId: 'u_ada',   createdAt: Date.now() - 1000*60*60*48, body: 'Confidently incorrect.', votes: 22, voters: {} },
    { id: 'r5', threadId: 't3', authorId: 'u_linus', createdAt: Date.now() - 1000*60*60*47, body: 'There is no settled question here. Move on.', votes: 9, voters: {} },
    { id: 'r6', threadId: 't5', authorId: 'u_max',   createdAt: Date.now() - 1000*60*60*100, body: 'I started doing this last month. It changed everything. The permanence forces honesty.', votes: 17, voters: {} },
    { id: 'r7', threadId: 't6', authorId: 'u_grace', createdAt: Date.now() - 1000*60*60*8,  body: 'Small. Daily. Boring. Forty minutes before work is a year of progress.', votes: 13, voters: {} },
  ],

  announcements: [
    {
      id: 'a1',
      createdAt: Date.now() - 1000 * 60 * 60 * 12,
      title: 'New community guidelines now in effect',
      body: 'Please read the updated guidelines before posting. The short version: be substantive, be specific, and assume good faith from the other side until they prove otherwise.',
    },
    {
      id: 'a2',
      createdAt: Date.now() - 1000 * 60 * 60 * 72,
      title: 'Weekly discussion: what are you building?',
      body: 'Drop a comment in this week\'s thread describing what you\'re working on. The most upvoted project gets featured at the top of the homepage next week.',
    },
    {
      id: 'a3',
      createdAt: Date.now() - 1000 * 60 * 60 * 168,
      title: 'Moderation team is expanding',
      body: 'We\'re bringing on three new moderators next month. If you\'d like to help, applications are open until the end of the month.',
    },
  ],
};

/* ---------- Storage helpers ---------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
      return JSON.parse(JSON.stringify(SEED_DATA));
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('loadState failed, reseeding', e);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DATA));
    return JSON.parse(JSON.stringify(SEED_DATA));
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ---------- Derived ---------- */

function userById(state, id) {
  return state.users.find(u => u.id === id) || { id, name: 'unknown' };
}

function computeReputation(state) {
  // sum thread + reply votes per author
  const rep = {};
  state.users.forEach(u => { rep[u.id] = 0; });
  state.threads.forEach(t => { rep[t.authorId] = (rep[t.authorId] || 0) + (t.votes || 0); });
  state.replies.forEach(r => { rep[r.authorId] = (rep[r.authorId] || 0) + (r.votes || 0); });
  return rep;
}

function uid(prefix='id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}
