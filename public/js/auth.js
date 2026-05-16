/* =========================================================
   auth.js — frontend auth (server-backed)
   ========================================================= */

let currentUser = null;

function authFormHTML(mode) {
  const isUp = mode === 'signup';
  return `
    <div class="auth-tabs">
      <button class="auth-tab ${!isUp ? 'active' : ''}" data-auth-mode="signin">Sign In</button>
      <button class="auth-tab ${isUp ? 'active' : ''}" data-auth-mode="signup">Sign Up</button>
    </div>
    <div id="auth-msg"></div>
    <label for="auth-name">Username</label>
    <input id="auth-name" autocomplete="username" placeholder="${isUp ? '3-20 chars, a-z 0-9 _' : 'username'}" />
    <label for="auth-pass">Password</label>
    <input id="auth-pass" type="password" autocomplete="${isUp ? 'new-password' : 'current-password'}" placeholder="${isUp ? 'min 6 characters' : 'password'}" />
    ${isUp ? `
      <label for="auth-pass2">Confirm Password</label>
      <input id="auth-pass2" type="password" autocomplete="new-password" placeholder="repeat password" />
    ` : ''}
    <p class="form-note">Your account lives on the server. Sessions persist via secure cookie.</p>
    <button class="primary-btn" id="auth-submit">${isUp ? 'Create Account' : 'Sign In'}</button>
  `;
}

function showAuthMsg(text, kind) {
  const el = document.querySelector('#auth-msg');
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  const cls = kind === 'ok' ? 'form-ok' : 'form-error';
  el.innerHTML = `<div class="${cls}">${escapeHTML(text)}</div>`;
}

let _authBusy = false;

function bindAuthModal(mode) {
  const nameInput = document.querySelector('#auth-name');
  if (nameInput) setTimeout(() => nameInput.focus(), 20);

  document.querySelectorAll('.auth-tab').forEach(t => {
    t.onclick = () => {
      const m = t.dataset.authMode;
      document.querySelector('#modal-body').innerHTML = authFormHTML(m);
      bindAuthModal(m);
    };
  });

  const submit = async () => {
    if (_authBusy) return;
    showAuthMsg('', null);
    const name = document.querySelector('#auth-name').value;
    const pass = document.querySelector('#auth-pass').value;
    const pass2 = document.querySelector('#auth-pass2')?.value;

    _authBusy = true;
    document.querySelector('#auth-submit').textContent = '...';

    try {
      let resp;
      if (mode === 'signup') {
        if (pass !== pass2) {
          showAuthMsg('Passwords do not match.', 'error');
          return;
        }
        resp = await API.signUp(name, pass);
      } else {
        resp = await API.signIn(name, pass);
      }
      currentUser = resp.user;
      refreshUserBadge();
      closeModal();
      toast(mode === 'signup' ? 'Account created' : 'Signed in');
      if (typeof renderCurrentRoute === 'function') renderCurrentRoute();
    } catch (err) {
      showAuthMsg(err.message || 'Auth failed.', 'error');
    } finally {
      _authBusy = false;
      const btn = document.querySelector('#auth-submit');
      if (btn) btn.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
    }
  };

  document.querySelector('#auth-submit').onclick = submit;
  ['auth-name', 'auth-pass', 'auth-pass2'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit();
    });
  });
}

function openLoginModal(initialMode = 'signin') {
  openModal(initialMode === 'signup' ? 'Sign Up' : 'Sign In', authFormHTML(initialMode));
  bindAuthModal(initialMode);
}

async function doSignOut() {
  try { await API.signOut(); } catch (e) {}
  currentUser = null;
  refreshUserBadge();
  toast('Signed out');
  if (typeof renderCurrentRoute === 'function') renderCurrentRoute();
}

function refreshUserBadge() {
  const b = document.querySelector('#user-badge');
  const btn = document.querySelector('#login-btn');
  const signupBtn = document.querySelector('#signup-btn');
  const rankBadge = document.querySelector('#user-rank-badge');
  const adminBtn = document.querySelector('#admin-btn');
  if (!b || !btn) return;
  if (currentUser) {
    b.textContent = currentUser.name;
    b.classList.add('is-user');
    btn.textContent = 'Sign Out';
    if (signupBtn) signupBtn.hidden = true;
    // rank
    if (rankBadge) {
      const r = (typeof rankFor === 'function') ? rankFor(currentUser.rank) : null;
      if (r && r.key !== 'member') {
        rankBadge.textContent = r.label;
        rankBadge.className = 'rank-badge rank-' + r.key;
        rankBadge.hidden = false;
      } else {
        rankBadge.hidden = true;
      }
    }
    // admin button
    if (adminBtn) {
      const isAdmin = (typeof canPromoteOthers === 'function') && canPromoteOthers(currentUser.rank);
      adminBtn.hidden = !isAdmin;
    }
  } else {
    b.textContent = 'Guest';
    b.classList.remove('is-user');
    btn.textContent = 'Sign In';
    if (signupBtn) signupBtn.hidden = false;
    if (rankBadge) rankBadge.hidden = true;
    if (adminBtn)  adminBtn.hidden = true;
  }
}

async function initAuthFromServer() {
  try {
    const { user } = await API.me();
    currentUser = user;
  } catch (_) {
    currentUser = null;
  }
  refreshUserBadge();
}

/* Toast */
let _toastTimer = null;
function toast(msg, ms = 1800) {
  let el = document.querySelector('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
