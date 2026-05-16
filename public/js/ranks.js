/* =========================================================
   ranks.js  —  shared rank definitions (client mirror)
   Kept in sync with server/ranks.js
   ========================================================= */

const RANKS = [
  { key: 'owner',         label: 'Owner',                level: 100, color: '#ff2e3f' },
  { key: 'senior_admin',  label: 'Senior Administrator', level: 90,  color: '#ff7a3f' },
  { key: 'admin',         label: 'Administrator',        level: 80,  color: '#ffb73f' },
  { key: 'lead_mod',      label: 'Lead Moderator',       level: 70,  color: '#3fb1ff' },
  { key: 'senior_mod',    label: 'Senior Moderator',     level: 60,  color: '#3f7fff' },
  { key: 'mod',           label: 'Moderator',            level: 50,  color: '#5f7fff' },
  { key: 'support',       label: 'Support Team',         level: 30,  color: '#3fd0aa' },
  { key: 'member',        label: 'Member',               level: 0,   color: '#9aa5b8' },
];

const RANK_BY_KEY = Object.fromEntries(RANKS.map(r => [r.key, r]));

function rankFor(key) { return RANK_BY_KEY[key] || RANK_BY_KEY.member; }
function rankLevel(key) { return rankFor(key).level; }

const MOD_LEVEL        = 50;
const ANN_POST_LEVEL   = 70;
const ANN_DELETE_LEVEL = 80;
const ADMIN_LEVEL      = 80;

function canModerate(rankKey)          { return rankLevel(rankKey) >= MOD_LEVEL; }
function canPostAnnouncement(rankKey)  { return rankLevel(rankKey) >= ANN_POST_LEVEL; }
function canEditAnnouncement(rankKey)  { return rankLevel(rankKey) >= ANN_POST_LEVEL; }
function canDeleteAnnouncement(rankKey){ return rankLevel(rankKey) >= ANN_DELETE_LEVEL; }
function canPromoteOthers(rankKey)     { return rankLevel(rankKey) >= ADMIN_LEVEL; }

function canAssignRank(actorRank, targetRank) {
  const actorLvl = rankLevel(actorRank);
  const targetLvl = rankLevel(targetRank);
  if (actorLvl < ADMIN_LEVEL) return false;
  if (actorRank === 'owner') return true;
  return targetLvl < actorLvl;
}
function canModifyUser(actorRank, targetRank) {
  if (actorRank === 'owner') return true;
  return rankLevel(actorRank) > rankLevel(targetRank);
}
