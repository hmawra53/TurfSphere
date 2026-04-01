// js/app.js — TurfSphere v2 Global Utilities
const BASE = 'https://turfsphere.onrender.com';   // same-origin; change to 'http://localhost:3000' if serving separately

// ── Auth ──────────────────────────────────────────────────────
const Auth = {
  getToken() { return localStorage.getItem('ts_token'); },
  getUser()  { try { return JSON.parse(localStorage.getItem('ts_user')); } catch{ return null; } },
  set(token, user) { localStorage.setItem('ts_token', token); localStorage.setItem('ts_user', JSON.stringify(user)); },
  clear()    { ['ts_token','ts_user','ts_turfId','ts_turfName','ts_bookingId','ts_justBooked'].forEach(k => localStorage.removeItem(k)); },
  loggedIn() { return !!this.getToken(); },
  role()     { return this.getUser()?.role || null; },
  isAdmin()  { return this.role() === 'admin'; },
  isOwner()  { return ['owner','admin'].includes(this.role()); }
};

// ── HTTP helpers ──────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const h = { 'Content-Type': 'application/json', ...opts.headers };
  if (Auth.getToken()) h['Authorization'] = 'Bearer ' + Auth.getToken();
  const res = await fetch(BASE + path, { ...opts, headers: h });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const api = {
  get:    p       => apiFetch(p),
  post:   (p,b)   => apiFetch(p, { method:'POST',   body: JSON.stringify(b) }),
  put:    (p,b)   => apiFetch(p, { method:'PUT',    body: JSON.stringify(b) }),
  delete: (p,b)   => apiFetch(p, { method:'DELETE', ...(b ? { body: JSON.stringify(b) } : {}) })
};

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  let c = document.getElementById('toasts');
  if (!c) { c = Object.assign(document.createElement('div'), { id:'toasts' }); document.body.appendChild(c); }
  const icons = { success:'fa-check-circle', error:'fa-times-circle', info:'fa-info-circle', warning:'fa-exclamation-triangle' };
  const el = Object.assign(document.createElement('div'), { className:`toast ${type}`, innerHTML:`<i class="fas ${icons[type]}"></i> ${msg}` });
  c.appendChild(el);
  setTimeout(() => el.remove(), 3700);
}

// ── Loading state ─────────────────────────────────────────────
function setLoading(el, on) {
  if (!el) return;
  if (on) { el._t = el.innerHTML; el.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>'; el.disabled = true; }
  else    { el.innerHTML = el._t || el.innerHTML; el.disabled = false; }
}

// ── Guard ─────────────────────────────────────────────────────
function guard(role = null) {
  if (!Auth.loggedIn()) { window.location.href = 'login.html'; return false; }
  if (role === 'admin' && !Auth.isAdmin()) { window.location.href = 'home.html'; return false; }
  if (role === 'owner' && !Auth.isOwner()) { window.location.href = 'home.html'; return false; }
  return true;
}

// ── Logout ────────────────────────────────────────────────────
function logout() { Auth.clear(); window.location.href = 'login.html'; }

// ── Dashboard redirect ────────────────────────────────────────
function goToDashboard() {
  const r = Auth.role();
  window.location.href = r === 'admin' ? 'admin-dashboard.html' : r === 'owner' ? 'owner-dashboard.html' : 'user-dashboard.html';
}

// ── Navbar builder ────────────────────────────────────────────
function buildNav({ search = false } = {}) {
  const user = Auth.getUser();
  const searchHTML = search ? `
    <div class="nav-search" id="ns">
      <input type="text" id="searchInput" placeholder="Search turf, city…">
      <button onclick="doSearch()"><i class="fas fa-search"></i></button>
    </div>` : '<div></div>';

  const right = user ? `
    <div class="nav-actions" id="navActs">
      ${search ? `<button class="hamburger" onclick="toggleSearch()"><i class="fas fa-search"></i></button>` : ''}
      <a href="find-players.html" class="btn btn-secondary btn-sm hide-mob" title="Find Players"><i class="fas fa-users"></i> <span class="hide-mob">Players</span></a>
      <a href="tournaments.html" class="btn btn-secondary btn-sm hide-mob" title="Tournaments"><i class="fas fa-trophy"></i> <span class="hide-mob">Tournaments</span></a>
      <button class="btn btn-secondary btn-sm hide-mob" onclick="goToDashboard()">
        <i class="fas fa-user"></i> ${user.name.split(' ')[0]}
      </button>
      <button class="btn btn-danger btn-sm" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> <span class="hide-mob">Logout</span>
      </button>
    </div>` : `
    <div class="nav-actions">
      <a href="login.html" class="btn btn-secondary btn-sm">Login</a>
      <a href="register.html" class="btn btn-green btn-sm">Register</a>
    </div>`;

  const nav = document.createElement('nav');
  nav.className = 'navbar';
  nav.innerHTML = `<a class="brand" href="${user ? (Auth.isAdmin()?'admin-dashboard.html':Auth.isOwner()?'owner-dashboard.html':'home.html') : 'login.html'}"><i class="fas fa-futbol"></i> TurfSphere</a>${searchHTML}${right}`;
  document.body.prepend(nav);

  // Search on Enter
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement.id === 'searchInput') doSearch();
  });
}

function toggleSearch() {
  document.getElementById('ns')?.classList.toggle('open');
}

// ── Stars builder ─────────────────────────────────────────────
function buildStars(rating, turfId, interactive = false) {
  const r = Math.round(rating);
  return Array.from({length:5}, (_,i) =>
    `<span class="star ${i<r?'on':''}" data-i="${i+1}"
      ${interactive ? `onclick="rateTurf(${turfId},${i+1})"` : ''}
      onmouseover="${interactive ? `hoverStars(this,${turfId})` : ''}"
      onmouseout="${interactive ? `resetStars(this,${turfId},${r})` : ''}">★</span>`
  ).join('') + `<span class="star-txt">${rating} / 5</span>`;
}

function hoverStars(el) {
  const row  = el.closest('.stars');
  const idx  = parseInt(el.dataset.i);
  row.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('on', i < idx));
}
function resetStars(el, id, r) {
  const row = el.closest('.stars');
  row.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('on', i < r));
}

// ── Misc ──────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '';
  return new Date(d.replace(' ', 'T')).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'});
}
function fmtTime(t) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h%12||12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function sportIcon(sport) {
  return {Football:'fa-futbol',Cricket:'fa-baseball-ball',Basketball:'fa-basketball-ball',Tennis:'fa-table-tennis',Badminton:'fa-shuttlecock'}[sport] || 'fa-trophy';
}

// ── Image helpers ─────────────────────────────────────────────
// Splits a turf image string into an array of individual image URLs/base64 strings.
// Images are stored comma-separated, BUT base64 data-URLs also contain commas
// (e.g. "data:image/jpeg;base64,/9j/4AAQ..."), so we cannot blindly split on ','.
// Strategy: scan for boundaries that start a new image: ",data:" or ",http".
function parseImages(imageStr) {
  if (!imageStr) return [];
  const result = [];
  let current = '';
  // Walk through the string finding image boundaries
  let i = 0;
  while (i < imageStr.length) {
    // Check if we're at a boundary: a comma followed by "data:" or "http"
    if (imageStr[i] === ',' && i + 1 < imageStr.length) {
      const rest = imageStr.slice(i + 1);
      if (rest.startsWith('data:') || rest.startsWith('http')) {
        // Save current image and start a new one
        if (current.trim()) result.push(current.trim());
        current = '';
        i++; // skip the comma
        continue;
      }
    }
    current += imageStr[i];
    i++;
  }
  if (current.trim()) result.push(current.trim());
  return result.filter(Boolean);
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=800';

// Returns the first valid image src from a stored image string, or the fallback.
function parseFirstImage(imageStr) {
  const imgs = parseImages(imageStr);
  return imgs[0] || FALLBACK_IMG;
}
