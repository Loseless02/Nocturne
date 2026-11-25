import { generatePassword, PW_STYLES, PW_DEFAULTS, generateNicknames, THEMES, NICK_CASES, NICK_COUNT_INFO, WORDS } from './gen.js';
import { parseTotp, totpCode, totpRemaining, clearTotpCaches } from './totp.js';
import { parseImport, exportCSV, hostOf, titleFromUrl, detectLoginType } from './io.js';

const TA = window.__TAURI__;
const invoke = TA.core.invoke;
const listen = TA.event.listen;
const appWin = TA.window.getCurrentWindow();

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1) : '');
const uid = () => crypto.randomUUID();
const hue = (s) => { let h = 0; for (const c of String(s || '?').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 195 + (h % 70); };
const initial = (s) => (String(s || '?').trim().match(/[\p{L}\p{N}]/u) || ['?'])[0];
const DAY = 864e5;
function ago(t) {
  if (!t) return 'never';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d < 31) return `${d} day${d > 1 ? 's' : ''} ago`;
  const m = Math.floor(d / 30.4);
  if (m < 12) return `${m} month${m > 1 ? 's' : ''} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y > 1 ? 's' : ''} ago`;
}
const fmtN = (n) => Number(n).toLocaleString('en-US');
// Colour digits and symbols. Works per character on the raw string so HTML entities never get split.
const pwChars = (v) => [...String(v ?? '')].map((ch) => (/\d/.test(ch) ? `<span class="d">${ch}</span>` : /\p{L}/u.test(ch) ? esc(ch) : `<span class="y">${esc(ch)}</span>`)).join('');

const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I = {
  search: svg('<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6C3.6 8.6 2 12 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6M14.1 14.1a3 3 0 0 1-4.2-4.2M3 3l18 18"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  key: svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M16 7l3 3M18.5 4.5l2 2"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  mail: svg('<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 7 9 6 9-6"/>'),
  phone: svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  ext: svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  shield: svg('<path d="M12 21.5s8-3.8 8-10V5l-8-2.8L4 5v6.5c0 6.2 8 10 8 10z"/>'),
  shieldCheck: svg('<path d="M12 21.5s8-3.8 8-10V5l-8-2.8L4 5v6.5c0 6.2 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  star: svg('<path d="m12 2.8 2.9 5.9 6.4.9-4.7 4.5 1.1 6.4L12 17.5l-5.7 3 1.1-6.4-4.7-4.5 6.4-.9z"/>'),
  sliders: svg('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>'),
  sparkle: svg('<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8L4.5 10.8 10.2 9z"/><path d="M19 3v3.5M17.2 4.8h3.6M5 17v3M3.5 18.5h3"/>'),
  trash: svg('<path d="M3.5 6.5h17M9 6.5V4.5h6v2M18.5 6.5l-.9 13a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8l-.9-13M10 11v6M14 11v6"/>'),
  edit: svg('<path d="M16.5 3.5a2.4 2.4 0 0 1 3.4 3.4L7.5 19.3 3 20.5l1.2-4.5z"/>'),
  x: svg('<path d="M17 7 7 17M7 7l10 10"/>'),
  check: svg('<path d="M20 6.5 9 17.5l-5-5"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  upload: svg('<path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15M17 8l-5-5-5 5M12 3v12"/>'),
  download: svg('<path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15M7 10l5 5 5-5M12 15V3"/>'),
  tag: svg('<path d="M12.6 2.6a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  hash: svg('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
  clock: svg('<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/>'),
  grid: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
  at: svg('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>'),
  dice: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/><circle cx="8.5" cy="15.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/>'),
  chev: svg('<path d="m9 6 6 6-6 6"/>'),
  chevDown: svg('<path d="m6 9 6 6 6-6"/>'),
  id: svg('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="12" r="2.2"/><path d="M14 10h4.5M14 14h4.5"/>'),
  note: svg('<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5"/>'),
  codes: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9h2M11 9h2M15 9h2M7 13h2M11 13h2M15 13h2M7 17h10"/>'),
  heart: svg('<path d="M19.5 13.6c1.5-1.5 2.5-3 2.5-5A5.4 5.4 0 0 0 16.6 3c-1.8 0-3.1.6-4.6 2.1C10.5 3.6 9.2 3 7.4 3A5.4 5.4 0 0 0 2 8.6c0 2 1 3.5 2.5 5L12 21z"/>'),
  power: svg('<path d="M12 2.5v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>'),
  globe: svg('<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19"/>'),
};
const MOON = '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.2a8.5 8.5 0 1 0 4.3 11.6 7 7 0 0 1-4.3-11.6z"/></svg>';

const KNOWN = `Google|google.com Gmail|mail.google.com YouTube|youtube.com GitHub|github.com GitLab|gitlab.com Microsoft|microsoft.com Outlook|outlook.com Xbox|xbox.com Apple|apple.com iCloud|icloud.com Amazon|amazon.com Netflix|netflix.com Spotify|spotify.com Discord|discord.com Steam|steampowered.com Epic_Games|epicgames.com Riot_Games|riotgames.com Battle.net|battle.net EA|ea.com Ubisoft|ubisoft.com PlayStation|playstation.com Nintendo|nintendo.com Twitch|twitch.tv Instagram|instagram.com Facebook|facebook.com WhatsApp|whatsapp.com Telegram|telegram.org X|x.com Twitter|twitter.com TikTok|tiktok.com Snapchat|snapchat.com Reddit|reddit.com LinkedIn|linkedin.com Pinterest|pinterest.com Tumblr|tumblr.com Dropbox|dropbox.com OneDrive|onedrive.live.com Notion|notion.so Slack|slack.com Zoom|zoom.us Figma|figma.com Canva|canva.com Adobe|adobe.com Vercel|vercel.com Netlify|netlify.com Cloudflare|cloudflare.com AWS|aws.amazon.com DigitalOcean|digitalocean.com Heroku|heroku.com npm|npmjs.com Docker|docker.com OpenAI|openai.com Claude|claude.ai Anthropic|anthropic.com PayPal|paypal.com Stripe|stripe.com Revolut|revolut.com Wise|wise.com Binance|binance.com Coinbase|coinbase.com eBay|ebay.com AliExpress|aliexpress.com Temu|temu.com Trendyol|trendyol.com Hepsiburada|hepsiburada.com Sahibinden|sahibinden.com e-Devlet|turkiye.gov.tr Proton|proton.me Yahoo|yahoo.com Yandex|yandex.com Airbnb|airbnb.com Booking|booking.com Uber|uber.com Duolingo|duolingo.com Medium|medium.com Patreon|patreon.com Kick|kick.com Roblox|roblox.com Minecraft|minecraft.net Valorant|playvalorant.com`
  .split(' ').map((s) => { const [n, d] = s.split('|'); return { n: n.replace(/_/g, ' '), d }; });

const FIELD_PRESETS = ['User ID', 'ID number', 'Customer number', 'Account number', 'Member ID', 'PIN', 'Security question', 'Security answer', 'Recovery email', 'Recovery phone', 'License key', 'Server', 'Port', 'API key', 'Wallet address'];
const SECRET_LABEL = /pin|answer|secret|key|password|passcode|cvv|code/i;

// ---------------------------------------------------------------- state
const DEFAULT_SETTINGS = { autolockMin: 5, clearSecs: 20, closeToTray: true, hotkey: true, hideAfterCopy: true, anim: true, autoBreach: true, genStyle: 'spit', sort: 'smart' };
const S = {
  vault: null, view: 'all', browse: 'service', filter: null, query: '', sel: null, cursor: 0,
  results: [], scores: {}, revealed: new Set(), summoned: false, healthTab: 'breached', scanning: false, emailScanning: false,
  gen: { style: 'spit', opts: structuredClone(PW_DEFAULTS), cur: null, hist: [] },
  nick: { themes: [], seed: '', style: 'pascal', numbers: 'some', leet: false, flair: false, maxLen: 0, list: [] },
  strengthCache: new Map(),
};

const set = () => S.vault.settings;
const entries = () => S.vault.entries;
const byId = (id) => S.vault.entries.find((e) => e.id === id);
const loginOf = (e) => e.username || e.email || e.phone || '';

function migrate(v) {
  v.entries = (v.entries || []).map(normalizeEntry);
  v.settings = { ...DEFAULT_SETTINGS, ...(v.settings || {}) };
  v.emailChecks = v.emailChecks || {};
  v.nickFavs = v.nickFavs || [];
  v.lastBreachScan = v.lastBreachScan || 0;
  return v;
}

function normalizeEntry(e) {
  const now = Date.now();
  const str = (v) => (v == null ? '' : String(v));
  const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
  return {
    id: str(e.id) || uid(), title: str(e.title).trim() || titleFromUrl(str(e.url)) || 'Untitled', url: str(e.url),
    username: str(e.username), email: str(e.email), phone: str(e.phone), password: str(e.password), totp: str(e.totp),
    codes: Array.isArray(e.codes) ? e.codes.filter((c) => c && c.c).map((c) => ({ c: String(c.c), used: !!c.used })) : [],
    fields: Array.isArray(e.fields) ? e.fields.filter((f) => f && (f.label || f.value)).map((f) => ({ label: String(f.label || 'Field'), value: String(f.value ?? ''), secret: !!f.secret })) : [],
    notes: str(e.notes), tags: Array.isArray(e.tags) ? e.tags.filter(Boolean).map(String) : [], fav: !!e.fav,
    created: num(e.created, now), updated: num(e.updated, now), pwChanged: num(e.pwChanged, num(e.created, now)),
    used: num(e.used, 0), uses: num(e.uses, 0),
    history: Array.isArray(e.history) ? e.history.filter((h) => h && h.p).map((h) => ({ p: str(h.p), t: num(h.t, now) })) : [],
    breach: e.breach && Number.isFinite(+e.breach.n) ? { n: +e.breach.n, t: num(e.breach.t, now) } : null,
  };
}

// ---------------------------------------------------------------- backend wrappers
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 120); }
async function flush() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!S.vault) return;
  try { await invoke('vault_save', { data: JSON.stringify(S.vault) }); }
  catch (e) { toast('Could not save: ' + e, { type: 'bad', duration: 6000 }); }
}

async function copy(text, label, { entry, quick, btn } = {}) {
  if (!text) { toast(`No ${label.toLowerCase()} saved`, { type: 'warn' }); return; }
  try {
    await invoke('copy_secret', { text, clearSecs: set().clearSecs });
  } catch (e) { toast('Clipboard error: ' + e, { type: 'bad' }); return; }
  if (entry) {
    entry.used = Date.now(); entry.uses = (entry.uses || 0) + 1; save();
    const meta = entry.id === S.sel && $('#detail .d-meta span:last-child');
    if (meta) meta.textContent = `Copied ${entry.uses} time${entry.uses === 1 ? '' : 's'}, last just now`;
  }
  if (btn) { btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 900); }
  const cs = set().clearSecs;
  toast(`${label} copied`, { sub: cs ? `clears in ${cs}s` : '', duration: 2400, bar: true });
  if (quick && S.summoned && set().hideAfterCopy) { S.summoned = false; setTimeout(() => invoke('hide_window'), 160); }
}

async function pushPrefs() {
  const s = set();
  try {
    const ok = await invoke('set_prefs', { autolockSecs: s.autolockMin * 60, closeToTray: s.closeToTray, hotkeyOn: s.hotkey });
    if (s.hotkey && !ok) toast('Ctrl+Shift+Space is used by another app, so the global shortcut is off.', { type: 'warn', duration: 5000 });
  } catch (e) { console.error(e); }
}

let lastTouch = 0;
function activity() {
  if (!S.vault) return;
  const n = Date.now();
  if (n - lastTouch > 10000) { lastTouch = n; invoke('touch').catch(() => {}); }
}

async function lockNow() {
  if (saveTimer) await flush();
  try { await invoke('vault_lock'); } catch {}
  hardLock();
}
function hardLock() {
  S.vault = null;
  clearTotpCaches();
  location.reload();
}

async function refreshScores(list = entries()) {
  const withPw = list.filter((e) => e.password);
  if (!withPw.length) return;
  try {
    const scores = await invoke('strength_many', { passwords: withPw.map((e) => e.password) });
    withPw.forEach((e, i) => (S.scores[e.id] = scores[i]));
    if (S.view === 'all' || S.view === 'fav') updateList(); else if (S.view === 'health') renderCenter();
    renderSide();
  } catch (e) { console.error(e); }
}

// ---------------------------------------------------------------- toasts & modals
function toast(msg, { type = 'ok', sub = '', duration = 2600, bar = false, action } = {}) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ico = { ok: I.check, warn: I.alert, bad: I.alert, info: I.shield }[type] || I.check;
  el.innerHTML = `<div class="t-ico">${ico}</div><div class="t-msg">${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>${action ? `<button class="btn sm">${esc(action.label)}</button>` : ''}${bar ? `<div class="bar" style="animation-duration:${duration}ms"></div>` : ''}`;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 220); };
  if (action) el.querySelector('button').onclick = () => { action.fn(); kill(); };
  while (root.children.length > 2) root.firstElementChild.remove();
  root.appendChild(el);
  setTimeout(kill, duration);
}

function modal(html, { cls = '', onMount } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  const prevFocus = document.activeElement;
  const close = () => {
    if (ov.dataset.closing) return;
    ov.dataset.closing = '1';
    ov.classList.add('closing');
    setTimeout(() => { ov.remove(); prevFocus?.focus?.(); }, 140);
  };
  ov._close = close;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  $('#modal-root').appendChild(ov);
  onMount?.(ov.firstElementChild, close);
  const first = ov.querySelector('[autofocus]') || ov.querySelector('input, textarea, button.primary');
  first?.focus();
  requestAnimationFrame(() => { if (!ov.contains(document.activeElement)) first?.focus(); });
  return close;
}
const topModal = () => $('#modal-root').lastElementChild;

function confirmDialog({ title, body, ok = 'Confirm', danger = false }) {
  return new Promise((res) => {
    let done = false;
    const close = modal(`
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <div class="modal-body"><p>${body}</p></div>
      <div class="modal-foot"><button class="btn ghost" data-r="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`,
    { cls: 'sm', onMount: (m, c) => {
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { done = true; res(b.dataset.r === '1'); c(); } });
      m.closest('.overlay').addEventListener('transitionend', () => {});
    } });
    const ov = topModal();
    const orig = ov._close;
    ov._close = () => { if (!done) res(false); done = true; orig(); };
    void close;
  });
}

function promptDialog({ title, body = '', label, type = 'text', ok = 'Continue' }) {
  return new Promise((res) => {
    let done = false;
    modal(`
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <form class="modal-body" id="pd-form">${body ? `<p>${body}</p>` : ''}
        <div><label class="lbl" for="pd-in">${esc(label)}</label><input class="input" id="pd-in" type="${type}" autofocus autocomplete="off" spellcheck="false"></div>
      </form>
      <div class="modal-foot"><button class="btn ghost" data-r="0">Cancel</button><button class="btn primary" data-r="1">${esc(ok)}</button></div>`,
    { cls: 'sm', onMount: (m, c) => {
      const finish = (v) => { done = true; res(v); c(); };
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) finish(b.dataset.r === '1' ? $('#pd-in', m).value : null); });
      $('#pd-form', m).addEventListener('submit', (e) => { e.preventDefault(); finish($('#pd-in', m).value); });
    } });
    const ov = topModal();
    const orig = ov._close;
    ov._close = () => { if (!done) res(null); done = true; orig(); };
  });
}

// ---------------------------------------------------------------- strength UI
async function strengthOf(password, inputs = []) {
  if (!password) return null;
  const k = password + '\u0000' + inputs.join('\u0000');
  if (S.strengthCache.has(k)) return S.strengthCache.get(k);
  const r = await invoke('strength', { password, inputs });
  if (S.strengthCache.size > 200) S.strengthCache.clear();
  S.strengthCache.set(k, r);
  return r;
}
const SCORE_TXT = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
const SCORE_CLS = ['s-bad', 's-bad', 's-warn', 's-ok', 's-ok'];
function meterHTML(score = -1, label = '', right = '') {
  return `<div class="meter s${score}"><i></i><i></i><i></i><i></i></div><div class="meter-label"><span>${score >= 0 ? `<b class="${SCORE_CLS[score]}">${SCORE_TXT[score]}</b>` : '&nbsp;'}${label ? ` · ${esc(label)}` : ''}</span><span>${right}</span></div>`;
}
async function paintMeter(el, password, inputs, extraRight = '') {
  if (!el) return;
  if (!password) { el.innerHTML = meterHTML(-1); return; }
  const r = await strengthOf(password, inputs);
  if (!r || !el.isConnected) return;
  el.innerHTML = meterHTML(r.score, `cracks in ${r.crack}`, extraRight);
  el.title = [r.warning, ...(r.suggestions || [])].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- health data
function healthData() {
  const list = entries();
  const pwMap = new Map();
  for (const e of list) if (e.password) { const a = pwMap.get(e.password) || []; a.push(e); pwMap.set(e.password, a); }
  const reused = new Set();
  for (const a of pwMap.values()) if (a.length > 1) a.forEach((e) => reused.add(e.id));
  const weak = new Set(list.filter((e) => e.password && ((S.scores[e.id] ?? 4) <= 2 || e.password.length < 8)).map((e) => e.id));
  // A breach result applies to every login that shares that password.
  const pwBreach = new Map();
  for (const e of list) if (e.password && e.breach && e.breach.n > 0) pwBreach.set(e.password, Math.max(pwBreach.get(e.password) || 0, e.breach.n));
  const breached = new Set(list.filter((e) => pwBreach.has(e.password)).map((e) => e.id));
  const old = new Set(list.filter((e) => e.password && Date.now() - (e.pwChanged || e.created) > 365 * DAY).map((e) => e.id));
  const twofa = list.filter((e) => e.totp).length;
  const emailHits = Object.entries(S.vault.emailChecks).filter(([, v]) => v.b && v.b.length);
  const withPw = list.filter((e) => e.password);
  let score = 100;
  if (withPw.length) {
    const per = withPw.map((e) => Math.min(breached.has(e.id) ? 0 : 100, weak.has(e.id) ? 40 : 100, reused.has(e.id) ? 50 : 100, old.has(e.id) ? 85 : 100));
    score = Math.round(per.reduce((a, b) => a + b, 0) / per.length);
  }
  return { reused, weak, breached, pwBreach, old, twofa, emailHits, score, total: withPw.length };
}

function badgesFor(e, hd) {
  let b = '';
  if (hd.breached.has(e.id)) b += `<span class="badge bad" title="Found in data breaches">${I.alert}Breached</span>`;
  else if (hd.weak.has(e.id)) b += `<span class="badge warn">Weak</span>`;
  if (hd.reused.has(e.id)) b += `<span class="badge warn" title="Same password used elsewhere">Reused</span>`;
  return b;
}

// ---------------------------------------------------------------- auth screens
function renderSetup() {
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card glass">
    <div class="auth-logo">${MOON}</div>
    <h1>Create your vault</h1>
    <p class="sub">One master password unlocks everything. It never leaves this PC and <b>cannot be recovered</b>, so keep it somewhere safe.</p>
    <form id="setup">
      <div>
        <label class="lbl" for="m1">Master password</label>
        <div class="input-wrap"><input class="input" id="m1" type="password" autocomplete="new-password" autofocus spellcheck="false">
          <div class="addons"><button type="button" class="icon-btn" data-eye="m1" aria-label="Show password">${I.eye}</button></div></div>
        <div id="m-meter" style="margin-top:9px">${meterHTML(-1)}</div>
      </div>
      <div>
        <label class="lbl" for="m2">Repeat it</label>
        <input class="input" id="m2" type="password" autocomplete="new-password" spellcheck="false">
        <div class="field-err" id="m-err" hidden></div>
      </div>
      <button type="button" class="link-btn" id="m-suggest">${I.sparkle}Suggest a strong passphrase</button>
      <button class="btn primary lg" id="m-go">Create vault</button>
    </form>
    <div class="hint">Stored encrypted with Argon2id + XChaCha20-Poly1305</div>
  </div></div>`;
  const m1 = $('#m1'), m2 = $('#m2'), err = $('#m-err');
  bindEyes($('#app'));
  m1.addEventListener('input', () => paintMeter($('#m-meter'), m1.value, ['nocturne']));
  $('#m-suggest').onclick = () => {
    const p = generatePassword('phrase', { words: 5, sep: '-', caps: true, number: true }).value;
    m1.type = 'text'; m1.value = p; m2.value = ''; m1.dispatchEvent(new Event('input')); m2.focus();
    toast('Write this down before you continue', { type: 'info', duration: 3500 });
  };
  $('#setup').onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (m1.value.length < 8) { err.textContent = 'Use at least 8 characters. A few random words works best.'; err.hidden = false; m1.focus(); return; }
    if (m1.value !== m2.value) { err.textContent = "The two passwords don't match."; err.hidden = false; m2.focus(); return; }
    const r = await strengthOf(m1.value, ['nocturne']);
    if (r && r.score < 2 && !(await confirmDialog({ title: 'Weak master password', body: 'This password is easy to guess, and it protects everything. Use it anyway?', ok: 'Use anyway', danger: true }))) return;
    const btn = $('#m-go');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating…';
    const vault = migrate({ v: 1, created: Date.now(), entries: [] });
    try {
      await invoke('vault_create', { master: m1.value, data: JSON.stringify(vault) });
      m1.value = m2.value = '';
      S.vault = vault;
      afterUnlock(true);
    } catch (x) { err.textContent = String(x); err.hidden = false; btn.disabled = false; btn.textContent = 'Create vault'; }
  };
}

function renderLock() {
  $('#app').innerHTML = `
  <div class="auth"><div class="auth-card glass" id="lock-card">
    <div class="auth-logo">${MOON}</div>
    <h1>Nocturne</h1>
    <p class="sub">Enter your master password to unlock</p>
    <form id="unlock">
      <div class="input-wrap"><input class="input" id="mp" type="password" placeholder="Master password" autocomplete="current-password" autofocus spellcheck="false" aria-label="Master password">
        <div class="addons"><button type="button" class="icon-btn" data-eye="mp" aria-label="Show password">${I.eye}</button></div></div>
      <div class="caps" id="caps" hidden>Caps Lock is on</div>
      <div class="field-err" id="u-err" hidden></div>
      <button class="btn primary lg" id="u-go">Unlock</button>
    </form>
    <div class="hint"><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Space</kbd> opens Nocturne from anywhere</div>
  </div></div>`;
  bindEyes($('#app'));
  const mp = $('#mp');
  setTimeout(() => mp.focus(), 50);
  mp.addEventListener('keyup', (e) => { $('#caps').hidden = !e.getModifierState?.('CapsLock'); });
  $('#unlock').onsubmit = async (e) => {
    e.preventDefault();
    if (!mp.value) return;
    const btn = $('#u-go'), err = $('#u-err');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Unlocking…'; err.hidden = true;
    try {
      const txt = await invoke('vault_unlock', { master: mp.value });
      mp.value = '';
      S.vault = migrate(JSON.parse(txt));
      afterUnlock(false);
    } catch (x) {
      err.textContent = String(x); err.hidden = false;
      btn.disabled = false; btn.textContent = 'Unlock';
      const card = $('#lock-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      mp.select();
    }
  };
}

function bindEyes(root) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-eye]');
    if (!b) return;
    const inp = document.getElementById(b.dataset.eye);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.innerHTML = show ? I.eyeOff : I.eye;
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}

function afterUnlock(isNew) {
  S.gen.style = set().genStyle in PW_STYLES ? set().genStyle : 'spit';
  applyAppearance();
  pushPrefs();
  $('#tb-lock').hidden = false;
  renderShell();
  refreshScores();
  if (isNew) setTimeout(() => toast('Vault created. Press Ctrl+N to add your first login.', { type: 'info', duration: 4500 }), 400);
  else maybeAutoScan();
}

function applyAppearance() {
  document.body.classList.toggle('no-anim', !(S.vault ? set().anim : true));
}

// ---------------------------------------------------------------- shell
function renderShell() {
  const wide = !['all', 'fav'].includes(S.view);
  $('#app').innerHTML = `<div class="shell ${wide ? 'wide' : ''}" id="shell">
    <aside class="side glass" id="side"></aside>
    <section class="center" id="center"></section>
    ${wide ? '' : '<aside class="detail glass" id="detail"></aside>'}
  </div>`;
  renderSide();
  renderCenter();
  renderDetail();
}

function setView(v) {
  const prevWide = !['all', 'fav'].includes(S.view);
  S.view = v;
  const wide = !['all', 'fav'].includes(v);
  if (wide !== prevWide || !$('#shell')) renderShell();
  else { renderSide(); renderCenter(); renderDetail(); }
}

const BROWSE = { service: 'Services', email: 'Emails', username: 'Usernames', phone: 'Phones', tag: 'Tags' };
const serviceKey = (e) => hostOf(e.url) || e.title.trim().toLowerCase();

function browseValues(kind) {
  const m = new Map();
  const add = (k, label) => { if (!k) return; const c = m.get(k) || { label, n: 0 }; c.n++; m.set(k, c); };
  for (const e of entries()) {
    if (kind === 'service') add(serviceKey(e), e.title);
    else if (kind === 'tag') e.tags.forEach((t) => add(t.toLowerCase(), t));
    else add((e[kind] || '').trim().toLowerCase(), (e[kind] || '').trim());
  }
  return [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label));
}

function matchesFilter(e, f) {
  if (!f) return true;
  if (f.kind === 'service') return serviceKey(e) === f.value;
  if (f.kind === 'tag') return e.tags.some((t) => t.toLowerCase() === f.value);
  return (e[f.kind] || '').trim().toLowerCase() === f.value;
}

function renderSide() {
  const side = $('#side');
  if (!side) return;
  const hd = healthData();
  const issues = new Set([...hd.breached, ...hd.weak, ...hd.reused]).size;
  const nav = (v, ico, label, count = '', alert = false) =>
    `<button class="${S.view === v ? 'on' : ''}" data-act="nav" data-view="${v}">${ico}<span>${label}</span>${count !== '' ? `<span class="count ${alert ? 'alert' : ''}">${count}</span>` : ''}</button>`;
  const vals = browseValues(S.browse);
  side.innerHTML = `
    <nav class="nav">
      ${nav('all', I.grid, 'All logins', entries().length)}
      ${nav('fav', I.star, 'Favorites', entries().filter((e) => e.fav).length || '')}
      ${nav('health', I.shield, 'Security', issues || '', issues > 0)}
      ${nav('generator', I.sparkle, 'Generator')}
      ${nav('nicknames', I.at, 'Nicknames')}
      ${nav('settings', I.sliders, 'Settings')}
    </nav>
    <div class="side-sep"></div>
    <div class="browse">
      <div class="browse-title">Browse by</div>
      <div class="browse-tabs">${Object.entries(BROWSE).map(([k, l]) => `<button class="${S.browse === k ? 'on' : ''}" data-act="browse-tab" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="browse-list">${vals.length ? vals.map(([k, v]) => {
        const on = S.filter && S.filter.kind === S.browse && S.filter.value === k;
        return `<button class="${on ? 'on' : ''}" data-act="browse-pick" data-v="${esc(k)}" title="${esc(v.label)}"><span class="bl-name">${esc(v.label)}</span><span class="bl-n">${v.n}</span></button>`;
      }).join('') : `<div class="browse-empty">Nothing here yet</div>`}</div>
    </div>
    <div class="side-foot"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Space</kbd><span>from anywhere</span></div>`;
}

function renderCenter() {
  const c = $('#center');
  if (!c) return;
  if (S.view === 'all' || S.view === 'fav') return renderListView(c);
  if (S.view === 'generator') return renderGenerator(c);
  if (S.view === 'nicknames') return renderNicknames(c);
  if (S.view === 'health') return renderHealth(c);
  if (S.view === 'settings') return renderSettings(c);
}

// ---------------------------------------------------------------- list
function renderListView(c) {
  c.innerHTML = `
    <div class="searchbar glass">${I.search}
      <input id="q" placeholder="Search logins, emails, usernames, sites…" value="${esc(S.query)}" spellcheck="false" autocomplete="off" aria-label="Search">
      <button class="btn primary sm" data-act="new" title="New login (Ctrl+N)">${I.plus}New</button>
    </div>
    <div class="listhead"><div class="chips" id="chips"></div><span class="result-n" id="rn"></span>
      <select class="input" id="sort" aria-label="Sort">
        ${[['smart', 'Most used'], ['az', 'A to Z'], ['recent', 'Recently edited'], ['created', 'Newest']].map(([v, l]) => `<option value="${v}" ${set().sort === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
    <div class="list" id="list" role="listbox" aria-label="Logins"></div>`;
  const q = $('#q');
  q.addEventListener('input', () => { S.query = q.value; S.cursor = 0; updateList(); });
  $('#sort').addEventListener('change', (e) => { set().sort = e.target.value; save(); updateList(); });
  updateList();
  requestAnimationFrame(() => q.focus());
}

function scoreMatch(e, toks) {
  if (!toks.length) return 1;
  const title = e.title.toLowerCase();
  const host = hostOf(e.url);
  const logins = [e.username, e.email, e.phone].join(' ').toLowerCase();
  const tags = e.tags.join(' ').toLowerCase();
  const rest = (e.fields.filter((f) => !f.secret).map((f) => f.label + ' ' + f.value).join(' ') + ' ' + e.fields.map((f) => f.label).join(' ') + ' ' + e.notes).toLowerCase();
  let total = 0;
  for (const t of toks) {
    let s = 0;
    if (title.startsWith(t)) s = 100;
    else if (title.split(/[\s._-]+/).some((w) => w.startsWith(t))) s = 85;
    else if (title.includes(t)) s = 70;
    else if (host.includes(t)) s = 60;
    else if (logins.includes(t)) s = 50;
    else if (tags.includes(t)) s = 45;
    else if (rest.includes(t)) s = 25;
    else if (fuzzy(title, t)) s = 15;
    if (!s) return 0;
    total += s;
  }
  return total;
}
function fuzzy(h, n) { let i = 0; for (const c of h) if (c === n[i]) i++; return i === n.length && n.length > 1; }
const frecency = (e) => (e.uses || 0) / (1 + (Date.now() - (e.used || 0)) / (7 * DAY)) + (e.fav ? 0.6 : 0);

function computeResults() {
  const toks = S.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let list = entries().filter((e) => (S.view !== 'fav' || e.fav) && matchesFilter(e, S.filter));
  const scored = list.map((e) => [e, scoreMatch(e, toks)]).filter(([, s]) => s > 0);
  const sort = set().sort;
  const cmp = {
    smart: (a, b) => frecency(b) - frecency(a) || a.title.localeCompare(b.title),
    az: (a, b) => a.title.localeCompare(b.title),
    recent: (a, b) => b.updated - a.updated,
    created: (a, b) => b.created - a.created,
  }[sort] || ((a, b) => a.title.localeCompare(b.title));
  scored.sort((x, y) => (toks.length ? y[1] - x[1] : 0) || cmp(x[0], y[0]));
  S.results = scored.map(([e]) => e);
  return toks;
}

function hl(text, toks) {
  const raw = String(text || '');
  if (!toks.length || !raw) return esc(raw);
  const low = raw.toLowerCase();
  const marks = new Array(raw.length).fill(false);
  for (const t of toks) { let i = low.indexOf(t); while (i >= 0) { for (let k = i; k < i + t.length; k++) marks[k] = true; i = low.indexOf(t, i + t.length); } }
  let out = '', on = false;
  for (let i = 0; i < raw.length; i++) {
    if (marks[i] !== on) { out += marks[i] ? '<mark>' : '</mark>'; on = marks[i]; }
    out += esc(raw[i]);
  }
  return out + (on ? '</mark>' : '');
}

function rowHTML(e, i, toks, hd) {
  const sub = e.username || e.email || e.phone || hostOf(e.url) || 'No login saved';
  const extra = e.username && e.email ? ` · ${e.email}` : '';
  const tot = parseTotp(e.totp);
  return `<div class="row ${e.id === S.sel ? 'sel' : ''} ${i === S.cursor ? 'cur' : ''}" role="option" aria-selected="${e.id === S.sel}" data-act="select" data-id="${e.id}" data-i="${i}" style="animation-delay:${Math.min(i, 12) * 14}ms">
    <div class="av" style="--h:${hue(e.title)}">${esc(initial(e.title))}</div>
    <div class="meta"><div class="t"><span class="name">${hl(e.title, toks)}</span>${e.fav ? svg('<path d="m12 2.8 2.9 5.9 6.4.9-4.7 4.5 1.1 6.4L12 17.5l-5.7 3 1.1-6.4-4.7-4.5 6.4-.9z"/>').replace('<svg', '<svg class="star-mini"') : ''}${badgesFor(e, hd)}</div>
      <div class="s">${hl(sub + extra, toks)}</div></div>
    <div class="quick">
      ${tot ? `<button class="qbtn" data-act="copy-totp" data-id="${e.id}" title="Copy 2FA code (Alt+Enter)"><svg class="ring" viewBox="0 0 20 20" data-ring="${e.id}"><circle class="bgc" cx="10" cy="10" r="8"/><circle class="fgc" cx="10" cy="10" r="8"/></svg><span class="totp-chip" data-totp="${e.id}">··· ···</span></button>` : ''}
      ${loginOf(e) ? `<button class="qbtn" data-act="copy-login" data-id="${e.id}" title="Copy ${e.username ? 'username' : e.email ? 'email' : 'phone'} (Shift+Enter)" aria-label="Copy login">${e.username ? I.user : e.email ? I.mail : I.phone}</button>` : ''}
      ${e.password ? `<button class="qbtn pw" data-act="copy-pw" data-id="${e.id}" title="Copy password (Enter)" aria-label="Copy password">${I.key}<span>Copy</span></button>` : ''}
    </div>
    ${i < 9 ? `<kbd class="nth">Ctrl ${i + 1}</kbd>` : ''}
  </div>`;
}

function updateList() {
  const list = $('#list');
  if (!list) return;
  const toks = computeResults();
  const hd = healthData();
  const chips = $('#chips');
  chips.innerHTML = (S.view === 'fav' ? `<span class="chip on">${I.star}Favorites</span>` : '') +
    (S.filter ? `<button class="chip on" data-act="clear-filter" title="Remove filter">${BROWSE[S.filter.kind].replace(/s$/, '')}: ${esc(browseValues(S.filter.kind).find(([k]) => k === S.filter.value)?.[1].label || S.filter.value)} ${I.x}</button>` : '');
  $('#rn').textContent = `${S.results.length} ${S.results.length === 1 ? 'login' : 'logins'}`;
  if (S.cursor >= S.results.length) S.cursor = Math.max(0, S.results.length - 1);
  // Keep the detail panel on the highlighted result (what Enter would copy).
  const selIdx = S.results.findIndex((e) => e.id === S.sel);
  if (selIdx >= 0 && !toks.length) S.cursor = selIdx;
  else if (S.results[S.cursor] && S.results[S.cursor].id !== S.sel) { S.sel = S.results[S.cursor].id; S.revealed.clear(); renderDetail(); }
  if (!S.results.length) {
    const none = !entries().length;
    list.innerHTML = `<div class="empty"><div class="em-ico">${none ? I.key : I.search}</div>
      <h3>${none ? 'Your vault is empty' : 'No matches'}</h3>
      <p>${none ? 'Add a login in seconds, or bring everything over from your browser or another password manager.' : `Nothing matches “${esc(S.query)}”${S.filter ? ' with this filter' : ''}.`}</p>
      <div class="btn-row" style="justify-content:center">${none ? `<button class="btn primary" data-act="new">${I.plus}Add login</button><button class="btn" data-act="import">${I.upload}Import file</button>` : `<button class="btn primary" data-act="new-from-q">${I.plus}Add “${esc(S.query.slice(0, 24))}”</button>`}</div></div>`;
    return;
  }
  const shown = S.results.slice(0, 400);
  list.innerHTML = shown.map((e, i) => rowHTML(e, i, toks, hd)).join('') + (S.results.length > 400 ? `<div class="empty" style="padding:16px">Showing 400 of ${S.results.length}. Search to narrow down.</div>` : '');
  tickTotp();
}

function moveCursor(d) {
  if (!S.results.length) return;
  S.cursor = Math.max(0, Math.min(S.results.length - 1, S.cursor + d));
  $$('.row.cur').forEach((r) => r.classList.remove('cur'));
  const row = $(`.row[data-i="${S.cursor}"]`);
  if (row) { row.classList.add('cur'); row.scrollIntoView({ block: 'nearest' }); }
  select(S.results[S.cursor].id, false);
}

function select(id, fromClick = true) {
  if (S.sel !== id) S.revealed.clear();
  S.sel = id;
  $$('.row.sel').forEach((r) => { r.classList.remove('sel'); r.setAttribute('aria-selected', 'false'); });
  const row = $(`.row[data-id="${id}"]`);
  if (row) { row.classList.add('sel'); row.setAttribute('aria-selected', 'true'); if (fromClick) { S.cursor = +row.dataset.i; $$('.row.cur').forEach((r) => r.classList.remove('cur')); row.classList.add('cur'); } }
  renderDetail();
}

const curEntry = () => byId(S.sel) || S.results[S.cursor];

// ---------------------------------------------------------------- detail
function fieldValue(e, f) {
  if (f.startsWith('field:')) return e.fields[+f.slice(6)]?.value || '';
  if (f.startsWith('hist:')) return e.history[+f.slice(5)]?.p || '';
  if (f.startsWith('code:')) return e.codes[+f.slice(5)]?.c || '';
  return e[f] || '';
}
const FIELD_LABEL = { username: 'Username', email: 'Email', phone: 'Phone', password: 'Password', url: 'Website', notes: 'Notes' };

function fieldRow({ e, f, label, icon = '', secret = false, mono = false, sub = '' }) {
  const value = fieldValue(e, f);
  const key = `${e.id}:${f}`;
  const shown = !secret || S.revealed.has(key);
  const disp = shown ? (secret ? `<span class="f-pw-chars">${pwChars(value)}</span>` : esc(value)) : '•'.repeat(Math.min(14, Math.max(8, value.length)));
  return `<div class="f"><div class="f-main" data-act="copy-field" data-id="${e.id}" data-f="${f}" title="Click to copy">
      <div class="f-label">${icon}${esc(label)}</div><div class="f-val ${shown ? '' : 'masked'} ${mono || (secret && shown) ? 'mono' : ''}">${disp}</div>${sub}</div>
    <div class="f-btns">${secret ? `<button class="icon-btn" data-act="reveal" data-key="${esc(key)}" aria-label="${shown ? 'Hide' : 'Show'} ${esc(label)}" title="${shown ? 'Hide' : 'Show'}">${shown ? I.eyeOff : I.eye}</button>` : ''}
      <button class="icon-btn" data-act="copy-field" data-id="${e.id}" data-f="${f}" aria-label="Copy ${esc(label)}" title="Copy">${I.copy}</button></div></div>`;
}

function renderDetail() {
  const d = $('#detail');
  if (!d) return;
  const e = byId(S.sel);
  if (!e) {
    d.className = 'detail glass empty-d';
    d.innerHTML = `<div><div class="empty" style="padding:0"><div class="em-ico">${I.key}</div></div>Select a login to see everything<br><span class="dim">Enter copies the password of the highlighted one</span></div>`;
    return;
  }
  d.className = 'detail glass';
  const hd = healthData();
  const host = hostOf(e.url);
  let h = `<div class="d-head"><div class="av lg" style="--h:${hue(e.title)}">${esc(initial(e.title))}</div>
    <div class="d-title"><h2 title="${esc(e.title)}">${esc(e.title)}</h2>${e.url ? `<button class="d-link" data-act="open-url" data-id="${e.id}" title="Open ${esc(e.url)}"><span>${esc(host || e.url)}</span>${I.ext}</button>` : '<span class="dim" style="font-size:13px">No website</span>'}</div>
    <div class="d-actions">
      <button class="icon-btn ${e.fav ? 'fav-on' : ''}" data-act="fav" data-id="${e.id}" aria-label="${e.fav ? 'Remove from favorites' : 'Add to favorites'}" title="Favorite">${I.star}</button>
      <button class="icon-btn" data-act="edit" data-id="${e.id}" aria-label="Edit" title="Edit (Ctrl+E)">${I.edit}</button>
      <button class="icon-btn" data-act="delete" data-id="${e.id}" aria-label="Delete" title="Delete">${I.trash}</button>
    </div></div>`;
  if (hd.breached.has(e.id)) h += `<div class="alert bad">${I.alert}<div><b>This password appeared in ${fmtN(hd.pwBreach.get(e.password))} data breaches.</b> Change it on ${esc(e.title)} now and don't reuse it.</div></div>`;
  if (hd.reused.has(e.id)) {
    const others = entries().filter((x) => x.id !== e.id && x.password === e.password).map((x) => x.title);
    h += `<div class="alert warn">${I.alert}<div>Same password as ${others.slice(0, 3).map(esc).join(', ')}${others.length > 3 ? ` and ${others.length - 3} more` : ''}. One leak unlocks all of them.</div></div>`;
  }
  const rows = [];
  if (e.username) rows.push(fieldRow({ e, f: 'username', label: 'Username', icon: I.user }));
  if (e.email) rows.push(fieldRow({ e, f: 'email', label: 'Email', icon: I.mail }));
  if (e.phone) rows.push(fieldRow({ e, f: 'phone', label: 'Phone', icon: I.phone }));
  if (e.password) rows.push(fieldRow({ e, f: 'password', label: 'Password', icon: I.key, secret: true, sub: `<div class="f-sub" id="d-meter" data-stop>${meterHTML(-1)}</div>` }));
  const tot = parseTotp(e.totp);
  if (e.totp) {
    rows.push(tot ? `<div class="f"><div class="f-main" data-act="copy-totp" data-id="${e.id}" title="Click to copy"><div class="f-label">${I.shieldCheck}2FA code</div><div class="f-val big" data-totp="${e.id}">··· ···</div></div>
      <div class="f-btns"><svg class="ring" viewBox="0 0 20 20" data-ring="${e.id}" style="width:22px;height:22px;margin:6px"><circle class="bgc" cx="10" cy="10" r="8"/><circle class="fgc" cx="10" cy="10" r="8"/></svg><button class="icon-btn" data-act="copy-totp" data-id="${e.id}" aria-label="Copy 2FA code">${I.copy}</button></div></div>`
      : `<div class="f"><div class="f-main"><div class="f-label">${I.alert}2FA secret</div><div class="f-val s-warn">Not a valid 2FA secret, edit it</div></div></div>`);
  }
  if (rows.length) h += `<div class="fgroup">${rows.join('')}</div>`;
  else h += `<div class="alert info">${I.key}<div>No login details yet. <button class="link-btn" data-act="edit" data-id="${e.id}">Add them</button></div></div>`;

  if (e.fields.length) {
    h += `<div class="sec-title">Extra fields</div><div class="fgroup">${e.fields.map((f, i) => fieldRow({ e, f: `field:${i}`, label: f.label, icon: f.secret ? I.lock : I.id, secret: f.secret })).join('')}</div>`;
  }
  if (e.codes.length) {
    const left = e.codes.filter((c) => !c.used).length;
    h += `<div class="sec-title"><span>Backup codes</span><span class="${left <= 2 ? 's-warn' : ''}" style="text-transform:none;letter-spacing:0">${left} of ${e.codes.length} left</span></div>
      <div class="fgroup"><div class="codes">${e.codes.map((c, i) => `<div class="code ${c.used ? 'used' : ''}" data-act="copy-field" data-id="${e.id}" data-f="code:${i}" title="Click to copy"><span>${esc(c.c)}</span><button data-act="code-used" data-id="${e.id}" data-i="${i}" aria-label="${c.used ? 'Mark as unused' : 'Mark as used'}" title="${c.used ? 'Mark unused' : 'Mark used'}">${c.used ? I.undo : I.check}</button></div>`).join('')}</div></div>`;
  }
  if (e.notes) h += `<div class="sec-title">Notes</div><div class="fgroup"><div class="notes">${esc(e.notes)}</div></div>`;
  if (e.tags.length) h += `<div class="sec-title">Tags</div><div class="tags">${e.tags.map((t) => `<button class="chip" data-act="tag-filter" data-v="${esc(t.toLowerCase())}">${I.tag}${esc(t)}</button>`).join('')}</div>`;
  if (e.history.length) {
    h += `<details class="hist" style="margin-top:16px"><summary>${I.clock.replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:6px"')}Password history (${e.history.length})</summary><div class="fgroup" style="margin-top:8px">${e.history.map((x, i) => fieldRow({ e, f: `hist:${i}`, label: `Used until ${new Date(x.t).toLocaleDateString()}`, secret: true })).join('')}</div></details>`;
  }
  h += `<div class="d-meta"><span>Password changed ${ago(e.pwChanged)}</span><span>Edited ${ago(e.updated)} · created ${new Date(e.created).toLocaleDateString()}</span><span>Copied ${e.uses || 0} time${e.uses === 1 ? '' : 's'}${e.used ? `, last ${ago(e.used)}` : ''}</span></div>`;
  d.innerHTML = h;
  if (e.password) paintMeter($('#d-meter'), e.password, [e.title, e.username, e.email].filter(Boolean));
  tickTotp();
}

// ---------------------------------------------------------------- entry form
function openForm(entry = null, preset = {}) {
  const isNew = !entry;
  const e = entry ? structuredClone(entry) : normalizeEntry({ fields: [], codes: [], tags: [] });
  if (isNew) e.title = preset.title || '';
  const logins = [];
  ['username', 'email', 'phone'].forEach((t) => { if (e[t]) logins.push({ type: t, value: e[t], manual: true }); });
  if (!logins.length) logins.push({ type: 'username', value: '', manual: false });
  let fields = e.fields.map((f) => ({ ...f }));
  const hasMore = !!(e.totp || e.codes.length || e.fields.length || e.notes || e.tags.length);
  let urlTouched = !!e.url;
  const allTags = [...new Set(entries().flatMap((x) => x.tags))];

  const TYPE_ICON = { username: I.user, email: I.mail, phone: I.phone };
  const loginRowsHTML = () => logins.map((l, i) => `
    <div class="login-row" data-li="${i}">
      <div class="input-wrap"><input class="input" data-login="${i}" value="${esc(l.value)}" placeholder="${i ? 'Another username, email or phone' : 'Username, email or phone'}" spellcheck="false" autocomplete="off" aria-label="Login ${i + 1}">
        <div class="addons"><button type="button" class="icon-btn" data-fa="nick" data-i="${i}" title="Generate a nickname" aria-label="Generate a nickname">${I.dice}</button></div></div>
      <button type="button" class="type-pill" data-fa="cycle" data-i="${i}" title="Click to change type">${TYPE_ICON[l.type]}${cap(l.type)}</button>
      ${i ? `<button type="button" class="icon-btn" data-fa="rm-login" data-i="${i}" aria-label="Remove">${I.x}</button>` : ''}
    </div>`).join('');
  const fieldRowsHTML = () => fields.map((f, i) => `
    <div class="custom-row" data-fi="${i}">
      <input class="input" data-flabel="${i}" value="${esc(f.label)}" placeholder="Label" list="field-presets" aria-label="Field name">
      <input class="input ${f.secret ? 'mono' : ''}" data-fval="${i}" value="${esc(f.value)}" type="${f.secret ? 'password' : 'text'}" placeholder="Value" spellcheck="false" aria-label="Field value">
      <button type="button" class="icon-btn ${f.secret ? 'on' : ''}" data-fa="secret" data-i="${i}" title="${f.secret ? 'Hidden field' : 'Visible field'}" aria-label="Toggle hidden">${f.secret ? I.lock : I.eye}</button>
      <button type="button" class="icon-btn" data-fa="rm-field" data-i="${i}" aria-label="Remove field">${I.x}</button>
    </div>`).join('');

  const close = modal(`
    <div class="modal-head"><h2>${isNew ? 'New login' : 'Edit ' + esc(e.title)}</h2><button class="icon-btn" data-fa="close" aria-label="Close">${I.x}</button></div>
    <form class="modal-body" id="ef" autocomplete="off">
      <div class="pos-rel"><label class="lbl" for="f-title">Service</label>
        <input class="input" id="f-title" value="${esc(e.title)}" placeholder="GitHub, Steam, my bank…" autofocus spellcheck="false">
        <div class="suggest" id="f-sug" hidden></div>
        <div class="field-err" id="f-err" hidden></div></div>
      <div><label class="lbl" for="f-url">Website <span class="dim" style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label>
        <input class="input" id="f-url" value="${esc(e.url)}" placeholder="github.com" spellcheck="false"></div>
      <div><label class="lbl">Login</label><div id="f-logins" style="display:grid;gap:8px">${loginRowsHTML()}</div>
        <button type="button" class="link-btn" data-fa="add-login" style="margin-top:8px">${I.plus}Add another login</button></div>
      <div><label class="lbl" for="f-pw">Password</label>
        <div class="login-row">
          <div class="input-wrap"><input class="input mono" id="f-pw" type="${isNew ? 'text' : 'password'}" value="${esc(e.password)}" placeholder="Type one or hit Spit" spellcheck="false">
            <div class="addons"><button type="button" class="icon-btn" data-eye="f-pw" aria-label="Show password">${isNew ? I.eyeOff : I.eye}</button></div></div>
          <button type="button" class="btn" data-fa="spit" title="Generate a readable strong password">${I.sparkle}Spit</button>
          <select class="input" id="f-style" style="width:132px;height:42px" aria-label="Password style">${Object.entries(PW_STYLES).map(([k, v]) => `<option value="${k}" ${S.gen.style === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        </div>
        <div id="f-meter" style="margin-top:9px">${meterHTML(-1)}</div></div>
      <button type="button" class="more-toggle ${hasMore ? 'open' : ''}" data-fa="more">${I.chev}2FA, backup codes, custom fields, notes</button>
      <div id="f-more" style="display:${hasMore ? 'grid' : 'none'};gap:16px">
        <div><label class="lbl" for="f-totp">2FA secret key</label>
          <input class="input mono" id="f-totp" value="${esc(e.totp)}" placeholder="JBSWY3DPEHPK3PXP or otpauth://…" spellcheck="false">
          <div class="dim" id="f-totp-prev" style="font-size:12px;margin:6px 2px 0">The setup key shown next to the QR code. Nocturne then shows live 6-digit codes.</div></div>
        <div><label class="lbl" for="f-codes">Backup / recovery codes</label>
          <textarea class="input mono" id="f-codes" placeholder="Paste them, one per line" spellcheck="false">${esc(e.codes.map((c) => c.c).join('\n'))}</textarea></div>
        <div><label class="lbl">Custom fields <span class="dim" style="text-transform:none;letter-spacing:0;font-weight:400">user ID, ID number, PIN…</span></label>
          <div id="f-fields" style="display:grid;gap:6px">${fieldRowsHTML()}</div>
          <div class="btn-row" style="margin-top:8px">${['User ID', 'ID number', 'PIN', 'Security answer'].map((p) => `<button type="button" class="chip" data-fa="add-field" data-label="${p}">${I.plus}${p}</button>`).join('')}<button type="button" class="chip" data-fa="add-field" data-label="">${I.plus}Other</button></div>
          <datalist id="field-presets">${FIELD_PRESETS.map((p) => `<option value="${p}">`).join('')}</datalist></div>
        <div><label class="lbl" for="f-tags">Tags</label><input class="input" id="f-tags" value="${esc(e.tags.join(', '))}" placeholder="work, games, bank" list="tag-list" spellcheck="false">
          <datalist id="tag-list">${allTags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
        <div><label class="lbl" for="f-notes">Notes</label><textarea class="input" id="f-notes" placeholder="Anything else">${esc(e.notes)}</textarea></div>
        <div class="opt"><span class="opt-l">Favorite<small>Pinned to the top of Favorites</small></span><label class="switch"><input type="checkbox" id="f-fav" aria-label="Favorite" ${e.fav ? 'checked' : ''}><i></i></label></div>
      </div>
    </form>
    <div class="modal-foot"><span class="left"><kbd>Ctrl</kbd><kbd>Enter</kbd> save</span><button class="btn ghost" data-fa="close">Cancel</button><button class="btn primary" data-fa="save">${isNew ? 'Save login' : 'Save changes'}</button></div>`,
  { onMount: (m, c) => bindForm(m, c) });

  function syncLogins(m) { $$('[data-login]', m).forEach((inp) => (logins[+inp.dataset.login].value = inp.value)); }
  function syncFields(m) {
    $$('[data-flabel]', m).forEach((inp) => (fields[+inp.dataset.flabel].label = inp.value));
    $$('[data-fval]', m).forEach((inp) => (fields[+inp.dataset.fval].value = inp.value));
  }

  function bindForm(m, closeFn) {
    bindEyes(m);
    const title = $('#f-title', m), url = $('#f-url', m), pw = $('#f-pw', m), sug = $('#f-sug', m);
    let sugIdx = 0, sugList = [];
    const meter = () => paintMeter($('#f-meter', m), pw.value, [title.value, ...logins.map((l) => l.value)].filter(Boolean));
    meter();
    pw.addEventListener('input', meter);
    url.addEventListener('input', () => (urlTouched = !!url.value));

    const showSug = () => {
      const q = title.value.trim().toLowerCase();
      sugList = q ? KNOWN.filter((k) => k.n.toLowerCase().startsWith(q) || k.d.startsWith(q)).slice(0, 5) : [];
      if (!sugList.length || (sugList.length === 1 && sugList[0].n.toLowerCase() === q && url.value)) { sug.hidden = true; return; }
      sugIdx = Math.min(sugIdx, sugList.length - 1);
      sug.innerHTML = sugList.map((k, i) => `<button type="button" class="${i === sugIdx ? 'on' : ''}" data-sug="${i}"><span class="av" style="--h:${hue(k.n)}">${esc(k.n[0])}</span>${esc(k.n)}<small>${esc(k.d)}</small></button>`).join('');
      sug.hidden = false;
    };
    const pick = (i) => {
      const k = sugList[i]; if (!k) return;
      title.value = k.n; if (!urlTouched) url.value = k.d;
      sug.hidden = true;
      m.querySelector('[data-login="0"]').focus();
    };
    title.addEventListener('input', () => { sugIdx = 0; showSug(); $('#f-err', m).hidden = true; });
    title.addEventListener('keydown', (ev) => {
      if (sug.hidden) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); sugIdx = (sugIdx + 1) % sugList.length; showSug(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); sugIdx = (sugIdx - 1 + sugList.length) % sugList.length; showSug(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') { if (sugList[sugIdx] && sugList[sugIdx].n.toLowerCase() !== title.value.trim().toLowerCase()) { ev.preventDefault(); ev.stopPropagation(); pick(sugIdx); } else sug.hidden = true; }
      else if (ev.key === 'Escape') { ev.stopPropagation(); sug.hidden = true; }
    });
    title.addEventListener('blur', () => setTimeout(() => {
      sug.hidden = true;
      const k = KNOWN.find((x) => x.n.toLowerCase() === title.value.trim().toLowerCase());
      if (k && !urlTouched && !url.value) url.value = k.d;
    }, 120));
    sug.addEventListener('mousedown', (ev) => { const b = ev.target.closest('[data-sug]'); if (b) { ev.preventDefault(); pick(+b.dataset.sug); } });

    m.addEventListener('input', (ev) => {
      const li = ev.target.dataset.login;
      if (li !== undefined) {
        const l = logins[+li]; l.value = ev.target.value;
        if (!l.manual) {
          const t = detectLoginType(l.value);
          if (t !== l.type) { l.type = t; const pill = m.querySelector(`[data-fa="cycle"][data-i="${li}"]`); pill.innerHTML = TYPE_ICON[t] + cap(t); }
        }
      }
      if (ev.target.id === 'f-totp') {
        const prev = $('#f-totp-prev', m), spec = parseTotp(ev.target.value);
        if (!ev.target.value.trim()) prev.textContent = 'The setup key shown next to the QR code. Nocturne then shows live 6-digit codes.';
        else if (!spec) { prev.innerHTML = '<span class="s-warn">That doesn\'t look like a 2FA secret yet</span>'; }
        else totpCode(spec).then((cd) => (prev.innerHTML = `<span class="s-ok">Valid.</span> Current code: <b class="mono">${cd}</b>`));
      }
      const fl = ev.target.dataset.flabel;
      if (fl !== undefined) {
        fields[+fl].label = ev.target.value;
        if (SECRET_LABEL.test(ev.target.value) && !fields[+fl].secret && !fields[+fl].value) { syncFields(m); fields[+fl].secret = true; rerenderFields(m, +fl, 'label'); }
      }
    });

    const rerenderFields = (mm, focusI, part = 'val') => {
      $('#f-fields', mm).innerHTML = fieldRowsHTML();
      if (focusI !== undefined) { const inp = mm.querySelector(part === 'label' ? `[data-flabel="${focusI}"]` : `[data-fval="${focusI}"]`); inp?.focus(); if (part === 'label') inp.setSelectionRange(inp.value.length, inp.value.length); }
    };

    m.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-fa]');
      if (!b) return;
      const a = b.dataset.fa, i = +b.dataset.i;
      if (a === 'close') closeFn();
      else if (a === 'save') doSave();
      else if (a === 'spit') spit();
      else if (a === 'more') { const box = $('#f-more', m); const open = box.style.display === 'none'; box.style.display = open ? 'grid' : 'none'; b.classList.toggle('open', open); if (open) $('#f-totp', m).focus(); }
      else if (a === 'cycle') { syncLogins(m); const order = ['username', 'email', 'phone']; const l = logins[i]; l.type = order[(order.indexOf(l.type) + 1) % 3]; l.manual = true; b.innerHTML = TYPE_ICON[l.type] + cap(l.type); }
      else if (a === 'add-login') { syncLogins(m); if (logins.length >= 3) return; const used = logins.map((l) => l.type); logins.push({ type: ['email', 'username', 'phone'].find((t) => !used.includes(t)) || 'username', value: '', manual: true }); $('#f-logins', m).innerHTML = loginRowsHTML(); m.querySelector(`[data-login="${logins.length - 1}"]`).focus(); }
      else if (a === 'rm-login') { syncLogins(m); logins.splice(i, 1); $('#f-logins', m).innerHTML = loginRowsHTML(); }
      else if (a === 'nick') {
        syncLogins(m);
        const n = generateNicknames({ count: 1, style: rngPick(['pascal', 'lower', 'snake', 'pascal']), numbers: 'some', seed: '' })[0];
        logins[i].value = n; logins[i].type = 'username'; logins[i].manual = true;
        $('#f-logins', m).innerHTML = loginRowsHTML();
        m.querySelector(`[data-login="${i}"]`).focus();
      }
      else if (a === 'add-field') { syncFields(m); const lab = b.dataset.label; fields.push({ label: lab, value: '', secret: SECRET_LABEL.test(lab) }); rerenderFields(m, fields.length - 1, lab ? 'val' : 'label'); }
      else if (a === 'rm-field') { syncFields(m); fields.splice(i, 1); rerenderFields(m); }
      else if (a === 'secret') { syncFields(m); fields[i].secret = !fields[i].secret; rerenderFields(m); }
    });

    $('#f-style', m).addEventListener('change', (ev) => { S.gen.style = ev.target.value; set().genStyle = ev.target.value; save(); spit(); });

    function spit() {
      const r = generatePassword(S.gen.style, S.gen.opts[S.gen.style]);
      pw.value = r.value; pw.type = 'text';
      const eye = m.querySelector('[data-eye="f-pw"]'); eye.innerHTML = I.eyeOff;
      pw.classList.remove('pop'); void pw.offsetWidth;
      meter();
    }

    m.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); doSave(); }
      else if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && sug.hidden) {
        // Enter walks service -> login -> password, then saves.
        ev.preventDefault();
        const t = ev.target;
        if (t === title || t === url) m.querySelector('[data-login="0"]').focus();
        else if (t.dataset.login !== undefined) { pw.focus(); if (!pw.value) spit(); pw.select(); }
        else doSave();
      }
    });
    $('#ef', m).addEventListener('submit', (ev) => { ev.preventDefault(); doSave(); });

    async function doSave() {
      syncLogins(m); syncFields(m);
      let t = title.value.trim();
      let u = url.value.trim();
      if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
      if (!t) t = titleFromUrl(u);
      const known = KNOWN.find((k) => k.n.toLowerCase() === t.toLowerCase());
      if (known) t = known.n;
      if (!t) { const err = $('#f-err', m); err.textContent = 'Give it a name, like “GitHub”.'; err.hidden = false; title.focus(); return; }
      const now = Date.now();
      const out = { ...e, title: t, url: u, username: '', email: '', phone: '', password: pw.value, totp: $('#f-totp', m).value.trim(), notes: $('#f-notes', m).value.replace(/\s+$/, ''), fav: $('#f-fav', m).checked, updated: now };
      out.fields = fields.filter((f) => f.label.trim() || f.value.trim()).map((f) => ({ label: f.label.trim() || 'Field', value: f.value, secret: !!f.secret }));
      for (const l of logins) {
        const v = l.value.trim();
        if (!v) continue;
        if (!out[l.type]) out[l.type] = v; else out.fields.unshift({ label: cap(l.type), value: v, secret: false });
      }
      const raw = $('#f-codes', m).value.trim();
      let codes = raw ? raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
      if (codes.length === 1 && /\s|,/.test(codes[0])) codes = codes[0].split(/[\s,;]+/).filter(Boolean);
      const usedMap = new Map(e.codes.map((c) => [c.c, c.used]));
      out.codes = codes.map((c) => ({ c, used: !!usedMap.get(c) }));
      out.tags = [...new Set($('#f-tags', m).value.split(',').map((s) => s.trim()).filter(Boolean))];
      const old = isNew ? null : byId(e.id);
      const pwChanged = !old || old.password !== out.password;
      if (old && pwChanged && old.password) { out.history = [{ p: old.password, t: now }, ...(old.history || [])].slice(0, 15); }
      if (pwChanged) { out.pwChanged = now; out.breach = null; }
      if (isNew) { out.created = now; S.vault.entries.push(out); }
      else Object.assign(old, out);
      const target = isNew ? out : old;
      save();
      closeFn();
      S.sel = target.id;
      if (S.view !== 'all' && S.view !== 'fav') setView('all'); else { updateList(); renderDetail(); }
      renderSide();
      toast(isNew ? `${target.title} saved` : 'Changes saved');
      if (target.password && pwChanged) {
        refreshScores([target]);
        if (set().autoBreach) checkBreaches([target], true);
      }
    }
  }
  void close;
}
const rngPick = (a) => a[Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * a.length)];

// ---------------------------------------------------------------- generator page
function renderGenerator(c) {
  const st = S.gen.style, o = S.gen.opts[st];
  const range = (k, label, min, max) => `<div class="opt col"><div class="opt-top"><span>${label}</span><b id="v-${k}">${o[k]}</b></div><input type="range" min="${min}" max="${max}" value="${o[k]}" data-gopt="${k}" style="--p:${((o[k] - min) / (max - min)) * 100}%" aria-label="${label}"></div>`;
  const tog = (k, label, sub = '') => `<label class="opt"><span class="opt-l">${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="switch"><input type="checkbox" data-gopt="${k}" ${o[k] ? 'checked' : ''}><i></i></span></label>`;
  let opts = '';
  if (st === 'spit') opts = range('words', 'Words', 2, 6);
  if (st === 'phrase') opts = range('words', 'Words', 3, 10) + `<div class="opt"><span class="opt-l">Separator</span><div class="seg">${[['-', 'dash'], ['.', 'dot'], ['_', 'under'], [' ', 'space'], ['', 'none']].map(([v, l]) => `<button class="${o.sep === v ? 'on' : ''}" data-gsep="${esc(v)}">${l}</button>`).join('')}</div></div>` + tog('caps', 'Capitalize words') + tog('number', 'Add a number');
  if (st === 'speak') opts = range('chunks', 'Word chunks', 2, 6) + tog('number', 'Add numbers') + tog('symbol', 'Add a symbol');
  if (st === 'random') opts = range('length', 'Length', 8, 64) + tog('upper', 'Uppercase A–Z') + tog('lower', 'Lowercase a–z') + tog('digits', 'Digits 0–9') + tog('symbols', 'Symbols !#$…') + tog('noAmbiguous', 'Skip look-alikes', 'No l, 1, O, 0');
  if (st === 'pin') opts = range('length', 'Digits', 4, 12);
  c.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Generator</h1><p>Strong passwords that still look like something a human could type.</p></div></div>
    <div class="gen-out glass">
      <div class="gen-pw" id="g-pw"></div>
      <div class="gen-meta" id="g-meter">${meterHTML(-1)}</div>
      <div class="gen-btns"><button class="btn lg" data-act="g-regen">${I.refresh}Again <kbd>Space</kbd></button><button class="btn primary lg" data-act="g-copy">${I.copy}Copy <kbd style="color:#dbeafe;border-color:rgba(255,255,255,.3);background:transparent">Enter</kbd></button></div>
    </div>
    <div class="card glass">
      <div class="seg" style="margin-bottom:14px">${Object.entries(PW_STYLES).map(([k, v]) => `<button class="${st === k ? 'on' : ''}" data-act="g-style" data-k="${k}">${v.label}</button>`).join('')}</div>
      <p class="card-sub">${PW_STYLES[st].hint}</p>
      <div class="opt-grid">${opts}</div>
    </div>
    <div class="card glass"><h3>This session</h3><p class="card-sub">Generated passwords are forgotten when Nocturne locks.</p><div class="hist-list" id="g-hist"></div></div>
  </div>`;
  c.querySelector('.page').addEventListener('input', (ev) => {
    const k = ev.target.dataset.gopt;
    if (!k) return;
    if (ev.target.type === 'range') {
      o[k] = +ev.target.value;
      $('#v-' + k).textContent = o[k];
      ev.target.style.setProperty('--p', ((o[k] - ev.target.min) / (ev.target.max - ev.target.min)) * 100 + '%');
    } else o[k] = ev.target.checked;
    regen();
  });
  c.querySelector('.page').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-gsep]');
    if (b) { o.sep = b.dataset.gsep; renderGenerator(c); }
  });
  if (!S.gen.cur || S.gen.cur.style !== st) regen(); else paintGen();
  paintHist();
}
function regen() {
  const r = generatePassword(S.gen.style, S.gen.opts[S.gen.style]);
  S.gen.cur = { ...r, style: S.gen.style };
  paintGen(true);
}
function paintGen(anim) {
  const el = $('#g-pw');
  if (!el) return;
  el.innerHTML = pwChars(S.gen.cur.value);
  if (anim) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  paintMeter($('#g-meter'), S.gen.cur.value, [], `≈ ${Math.round(S.gen.cur.bits)} bits`);
}
function paintHist() {
  const h = $('#g-hist');
  if (!h) return;
  h.innerHTML = S.gen.hist.length ? S.gen.hist.map((p, i) => `<div class="hist-item"><span class="mono">${esc(p)}</span><button class="icon-btn" data-act="g-hist" data-i="${i}" aria-label="Copy">${I.copy}</button></div>`).join('') : '<div class="dim" style="font-size:13px">Nothing copied yet.</div>';
}
async function genCopy() {
  if (!S.gen.cur) return;
  await copy(S.gen.cur.value, 'Password');
  if (S.gen.hist[0] !== S.gen.cur.value) S.gen.hist.unshift(S.gen.cur.value);
  S.gen.hist = S.gen.hist.slice(0, 10);
  paintHist();
}

// ---------------------------------------------------------------- nicknames page
function renderNicknames(c) {
  const n = S.nick;
  const allOn = !n.themes.length;
  c.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Nicknames</h1><p>${fmtN(NICK_COUNT_INFO())} words across ${Object.keys(THEMES).length} themes, five syllable engines and a dozen name patterns.</p></div>
      <button class="btn primary lg" data-act="n-gen">${I.dice}Generate <kbd style="color:#dbeafe;border-color:rgba(255,255,255,.3);background:transparent">Space</kbd></button></div>
    <div class="card glass">
      <div class="opt-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
        <div><label class="lbl" for="n-seed">Build around a word</label><input class="input" id="n-seed" value="${esc(n.seed)}" placeholder="Optional, e.g. your name or a vibe" spellcheck="false"></div>
        <div><label class="lbl" for="n-style">Format</label><select class="input" id="n-style">${Object.entries(NICK_CASES).map(([k, l]) => `<option value="${k}" ${n.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="lbl">Numbers</label><div class="seg">${[['never', 'None'], ['some', 'Some'], ['always', 'Always']].map(([k, l]) => `<button class="${n.numbers === k ? 'on' : ''}" data-act="n-num" data-k="${k}">${l}</button>`).join('')}</div></div>
        <div class="opt col"><div class="opt-top"><span>Max length</span><b id="n-maxv">${n.maxLen || 'Any'}</b></div><input type="range" id="n-max" min="0" max="24" value="${n.maxLen}" style="--p:${(n.maxLen / 24) * 100}%" aria-label="Max length"></div>
      </div>
      <div style="display:flex;gap:22px;flex-wrap:wrap;margin:14px 0 4px">
        <label class="opt" style="gap:10px"><span class="switch"><input type="checkbox" id="n-leet" ${n.leet ? 'checked' : ''}><i></i></span><span class="opt-l">L33t letters</span></label>
        <label class="opt" style="gap:10px"><span class="switch"><input type="checkbox" id="n-flair" ${n.flair ? 'checked' : ''}><i></i></span><span class="opt-l">Gamer flair <span class="dim">xX_name_Xx</span></span></label>
      </div>
      <label class="lbl" style="margin-top:12px">Themes</label>
      <div class="theme-chips"><button class="chip ${allOn ? 'on' : ''}" data-act="n-theme" data-k="*">Everything</button>${Object.entries(THEMES).map(([k, t]) => `<button class="chip ${n.themes.includes(k) ? 'on' : ''}" data-act="n-theme" data-k="${k}">${t.label}</button>`).join('')}</div>
    </div>
    <div class="nick-grid" id="n-grid"></div>
    ${S.vault.nickFavs.length ? `<div class="sec-title" style="margin-top:22px">Saved</div><div class="nick-grid">${S.vault.nickFavs.map((x) => nickCard(x, true)).join('')}</div>` : ''}
  </div>`;
  const page = c.querySelector('.page');
  page.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.id === 'n-seed') { n.seed = t.value; clearTimeout(page._t); page._t = setTimeout(nickGen, 250); }
    if (t.id === 'n-max') { n.maxLen = +t.value; $('#n-maxv').textContent = n.maxLen || 'Any'; t.style.setProperty('--p', (n.maxLen / 24) * 100 + '%'); nickGen(); }
  });
  page.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'n-style') { n.style = t.value; nickGen(); }
    if (t.id === 'n-leet') { n.leet = t.checked; nickGen(); }
    if (t.id === 'n-flair') { n.flair = t.checked; nickGen(); }
  });
  if (!n.list.length) nickGen(); else paintNicks();
}
function nickCard(name, saved = S.vault.nickFavs.includes(name)) {
  return `<div class="nick" data-act="n-copy" data-v="${esc(name)}" title="Click to copy"><span>${esc(name)}</span><button class="icon-btn ${saved ? 'on' : ''}" data-act="n-fav" data-v="${esc(name)}" aria-label="${saved ? 'Unsave' : 'Save'}" title="${saved ? 'Unsave' : 'Save'}">${I.heart}</button></div>`;
}
function nickGen() {
  const n = S.nick;
  n.list = generateNicknames({ themes: n.themes, seed: n.seed, style: n.style, numbers: n.numbers, leet: n.leet, flair: n.flair, maxLen: n.maxLen, count: 30 });
  paintNicks();
}
function paintNicks() {
  const g = $('#n-grid');
  if (g) g.innerHTML = S.nick.list.map((x) => nickCard(x)).join('') || '<div class="dim">No names fit those settings. Raise the max length.</div>';
}

// ---------------------------------------------------------------- health page + breach checks
async function checkBreaches(list, silent = false) {
  list = list.filter((e) => e.password);
  if (!list.length) return;
  if (!silent) { S.scanning = true; if (S.view === 'health') renderCenter(); }
  try {
    const counts = await invoke('hibp_check', { passwords: list.map((e) => e.password) });
    const before = list.filter((e) => e.breach && e.breach.n > 0).length;
    list.forEach((e, i) => { if (counts[i] >= 0) e.breach = { n: counts[i], t: Date.now() }; });
    if (list.length > 1) S.vault.lastBreachScan = Date.now();
    save();
    const hit = list.filter((e) => e.breach && e.breach.n > 0);
    if (hit.length > before || (!silent && hit.length)) {
      toast(hit.length === 1 ? `${hit[0].title}: this password was found in a data breach` : `${hit.length} passwords were found in data breaches`, { type: 'bad', duration: 7000, action: { label: 'Review', fn: () => { S.healthTab = 'breached'; setView('health'); } } });
    } else if (!silent) toast('No breached passwords found', { type: 'ok' });
  } catch (x) {
    if (!silent) toast(String(x), { type: 'bad', duration: 5000 });
  } finally {
    S.scanning = false;
    renderSide();
    if (S.view === 'health') renderCenter(); else if (S.view === 'all' || S.view === 'fav') { updateList(); renderDetail(); }
  }
}
function maybeAutoScan() {
  if (set().autoBreach && entries().length && Date.now() - S.vault.lastBreachScan > 3 * DAY) setTimeout(() => checkBreaches(entries(), true), 2500);
}
function allEmails() {
  const s = new Set();
  const isMail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
  for (const e of entries()) {
    [e.email, e.username].forEach((v) => isMail(v) && s.add(v.trim().toLowerCase()));
    e.fields.forEach((f) => !f.secret && isMail(f.value) && s.add(f.value.trim().toLowerCase()));
  }
  return [...s];
}
async function checkEmails() {
  const emails = allEmails();
  if (!emails.length) { toast('No email addresses saved yet', { type: 'warn' }); return; }
  if (!S.vault.emailConsent) {
    const ok = await confirmDialog({ title: 'Check emails for breaches', body: `Nocturne will send your ${emails.length} email address${emails.length > 1 ? 'es' : ''} (only the addresses, nothing else) to the free XposedOrNot breach database, one at a time. Continue?`, ok: 'Check emails' });
    if (!ok) return;
    S.vault.emailConsent = true; save();
  }
  S.emailScanning = true; renderCenter();
  let found = 0, failed = 0;
  for (const [i, em] of emails.entries()) {
    try {
      const b = await invoke('email_breaches', { email: em });
      S.vault.emailChecks[em] = { b, t: Date.now() };
      if (b.length) found++;
    } catch (x) { failed++; if (/rate/i.test(String(x))) { toast(String(x), { type: 'warn' }); break; } }
    if (i < emails.length - 1) await new Promise((r) => setTimeout(r, 1300));
  }
  save();
  S.emailScanning = false;
  if (S.view === 'health') renderCenter();
  toast(found ? `${found} email${found > 1 ? 's' : ''} found in breaches` : failed ? 'Some emails could not be checked' : 'No email breaches found', { type: found ? 'bad' : failed ? 'warn' : 'ok', duration: 5000 });
}

function renderHealth(c) {
  const hd = healthData();
  const col = hd.score >= 80 ? 'var(--ok)' : hd.score >= 50 ? 'var(--warn)' : 'var(--bad)';
  const circ = 2 * Math.PI * 56;
  const tabs = { breached: ['Breached', hd.breached, I.alert, 'bad'], weak: ['Weak', hd.weak, I.key, 'warn'], reused: ['Reused', hd.reused, I.refresh, 'warn'], old: ['Older than a year', hd.old, I.clock, 'info'] };
  const [tl, tset] = tabs[S.healthTab] || tabs.breached;
  const tlist = entries().filter((e) => tset.has(e.id)).sort((a, b) => a.title.localeCompare(b.title));
  const lastScan = S.vault.lastBreachScan ? ago(S.vault.lastBreachScan) : 'never';
  const emails = allEmails();
  c.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Security</h1><p>Breached, weak, reused and old logins, all in one place.</p></div></div>
    <div class="health-top">
      <div class="score-card glass"><div class="score-ring"><svg viewBox="0 0 130 130"><circle class="bgc" cx="65" cy="65" r="56"/><circle class="fgc" cx="65" cy="65" r="56" style="stroke:${col};stroke-dasharray:${circ};stroke-dashoffset:${circ * (1 - hd.score / 100)}"/></svg><div class="num" style="color:${col}">${hd.total ? hd.score : '–'}</div></div>
        <div class="muted" style="font-size:13px;margin-top:10px">${hd.total ? (hd.score >= 80 ? 'Looking good' : hd.score >= 50 ? 'Needs some work' : 'At risk') : 'No passwords yet'}</div></div>
      <div style="display:grid;gap:10px;align-content:start">
        <div class="stat-grid">${Object.entries(tabs).map(([k, [l, s, ico, cls]]) => `<button class="stat ${S.healthTab === k ? 'on' : ''}" data-act="h-tab" data-k="${k}"><div class="n ${s.size ? (cls === 'bad' ? 's-bad' : cls === 'warn' ? 's-warn' : '') : 's-ok'}">${s.size}</div><div class="l">${ico}${l}</div></button>`).join('')}
          <div class="stat"><div class="n">${hd.twofa}<span class="dim" style="font-size:16px">/${entries().length}</span></div><div class="l">${I.shieldCheck}Use 2FA codes</div></div></div>
      </div>
    </div>
    <div class="card glass">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">
        <div><h3>Password breach check</h3><p class="card-sub" style="margin:0">Uses Have I Been Pwned. Only the first 5 characters of each password's SHA-1 hash leave this PC, never the password. Last check: ${lastScan}.</p></div>
        <button class="btn primary" data-act="h-scan" ${S.scanning ? 'disabled' : ''}>${S.scanning ? '<span class="spinner"></span>Checking…' : I.refresh + 'Check all passwords'}</button>
      </div>
    </div>
    <div class="card glass">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">
        <div><h3>Email breach check</h3><p class="card-sub" style="margin:0">Checks your ${emails.length} saved email address${emails.length === 1 ? '' : 'es'} with XposedOrNot. The address is sent to them, so it only runs when you click. Phone numbers have no public breach database, so they get reuse checks only.</p></div>
        <button class="btn" data-act="h-emails" ${S.emailScanning || !emails.length ? 'disabled' : ''}>${S.emailScanning ? '<span class="spinner"></span>Checking…' : I.mail + 'Check emails'}</button>
      </div>
      ${emails.filter((em) => S.vault.emailChecks[em]).map((em) => { const r = S.vault.emailChecks[em]; return `<div class="hist-item" style="margin-top:8px;display:block"><div style="display:flex;justify-content:space-between;gap:10px"><span>${esc(em)}</span><span class="${r.b.length ? 's-bad' : 's-ok'}" style="font-size:12.5px;font-weight:600">${r.b.length ? `${r.b.length} breach${r.b.length > 1 ? 'es' : ''}` : 'Clean'} <span class="dim" style="font-weight:400">· ${ago(r.t)}</span></span></div>${r.b.length ? `<div class="breach-tags">${r.b.slice(0, 40).map((n) => `<span class="badge bad" style="text-transform:none;letter-spacing:0">${esc(n)}</span>`).join('')}${r.b.length > 40 ? `<span class="dim">+${r.b.length - 40}</span>` : ''}</div><div class="dim" style="font-size:12px;margin-top:6px">Change the password on every service that uses this email, starting with any that share a password.</div>` : ''}</div>`; }).join('')}
    </div>
    <div class="sec-title">${esc(tl)} · ${tlist.length}</div>
    <div class="issue-list">${tlist.length ? tlist.map((e) => `<div class="row" data-act="h-open" data-id="${e.id}"><div class="av" style="--h:${hue(e.title)}">${esc(initial(e.title))}</div><div class="meta"><div class="t"><span class="name">${esc(e.title)}</span>${badgesFor(e, hd)}</div><div class="s">${esc(loginOf(e) || hostOf(e.url))} · changed ${ago(e.pwChanged)}</div></div><div class="quick"><button class="qbtn" data-act="edit" data-id="${e.id}">${I.edit}Fix</button></div></div>`).join('') : `<div class="empty" style="padding:24px"><div class="em-ico" style="background:var(--ok-soft);color:var(--ok);border-color:rgba(52,211,153,.3)">${I.shieldCheck}</div><h3>All clear</h3><p>Nothing in this category.</p></div>`}</div>
  </div>`;
}

// ---------------------------------------------------------------- settings
function renderSettings(c) {
  const s = set();
  const NAMES = { autolockMin: 'Auto-lock', clearSecs: 'Clear clipboard', autoBreach: 'Check new passwords for breaches', hotkey: 'Global shortcut', hideAfterCopy: 'Hide after quick copy', closeToTray: 'Keep running in the tray', anim: 'Background animation' };
  const sel = (k, opts) => `<select class="input" data-set="${k}" aria-label="${NAMES[k]}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const tog = (k) => `<label class="switch"><input type="checkbox" data-set="${k}" aria-label="${NAMES[k]}" ${s[k] ? 'checked' : ''}><i></i></label>`;
  c.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Settings</h1><p>Everything stays on this PC.</p></div></div>
    <div class="card glass"><h3>Security</h3>
      <div class="set-row"><div class="set-l">Auto-lock<small>Lock after this long without any activity</small></div>${sel('autolockMin', [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [0, 'Never']])}</div>
      <div class="set-row"><div class="set-l">Clear clipboard<small>Wipe copied secrets after</small></div>${sel('clearSecs', [[10, '10 seconds'], [20, '20 seconds'], [30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [0, 'Never']])}</div>
      <div class="set-row"><div class="set-l">Check new passwords for breaches<small>k-anonymity lookup on save, and a full check every 3 days</small></div>${tog('autoBreach')}</div>
      <div class="set-row"><div class="set-l">Master password<small>Re-encrypts the vault with a new key</small></div><button class="btn sm" data-act="change-master">${I.key}Change</button></div>
    </div>
    <div class="card glass"><h3>Speed</h3>
      <div class="set-row"><div class="set-l">Global shortcut <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Space</kbd><small>Show or hide Nocturne from any app</small></div>${tog('hotkey')}</div>
      <div class="set-row"><div class="set-l">Hide after quick copy<small>When opened with the shortcut, pressing Enter copies and gets out of the way</small></div>${tog('hideAfterCopy')}</div>
      <div class="set-row"><div class="set-l">Keep running in the tray<small>Closing the window hides it, so the shortcut keeps working</small></div>${tog('closeToTray')}</div>
    </div>
    <div class="card glass"><h3>Appearance</h3>
      <div class="set-row"><div class="set-l">Background animation<small>Slow drifting light behind the glass</small></div>${tog('anim')}</div>
    </div>
    <div class="card glass"><h3>Import & export</h3>
      <p class="card-sub">Import CSV from Chrome, Edge, Brave, Firefox, Bitwarden, 1Password, LastPass or Proton Pass, Bitwarden JSON, or a Nocturne backup.</p>
      <div class="btn-row">
        <button class="btn" data-act="import">${I.upload}Import file</button>
        <button class="btn" data-act="export-backup">${I.download}Encrypted backup (.noct)</button>
        <button class="btn" data-act="export-json">${I.download}JSON</button>
        <button class="btn" data-act="export-csv">${I.download}CSV</button>
      </div>
    </div>
    <div class="card glass"><h3>Keyboard</h3>
      <div class="shortcuts" style="margin-top:12px">
        <span><kbd>Type</kbd></span><span>Search instantly, from anywhere in the list</span>
        <span><kbd>Enter</kbd></span><span>Copy password of the highlighted login</span>
        <span><kbd>Shift</kbd> <kbd>Enter</kbd></span><span>Copy username / email</span>
        <span><kbd>Alt</kbd> <kbd>Enter</kbd></span><span>Copy 2FA code</span>
        <span><kbd>Ctrl</kbd> <kbd>1</kbd>…<kbd>9</kbd></span><span>Copy password of result 1 to 9</span>
        <span><kbd>↑</kbd> <kbd>↓</kbd></span><span>Move through results</span>
        <span><kbd>Ctrl</kbd> <kbd>N</kbd> / <kbd>E</kbd></span><span>New login / edit selected</span>
        <span><kbd>Ctrl</kbd> <kbd>G</kbd></span><span>Generator</span>
        <span><kbd>Ctrl</kbd> <kbd>L</kbd></span><span>Lock now</span>
        <span><kbd>Esc</kbd></span><span>Clear search, then hide the window</span>
      </div>
    </div>
    <div class="card glass"><h3>About</h3>
      <p class="card-sub">Nocturne 0.1.0. ${entries().length} logins. Vault file: <span class="mono" id="vpath" style="user-select:text"></span></p>
      <div class="btn-row"><button class="btn" data-act="lock">${I.lock}Lock now</button><button class="btn danger" data-act="quit">${I.power}Quit Nocturne</button></div>
    </div>
  </div>`;
  invoke('vault_status').then((st) => { const p = $('#vpath'); if (p) p.textContent = st.path; });
  c.querySelector('.page').addEventListener('change', (ev) => {
    const k = ev.target.dataset.set;
    if (!k) return;
    s[k] = ev.target.type === 'checkbox' ? ev.target.checked : +ev.target.value;
    save();
    if (['autolockMin', 'closeToTray', 'hotkey'].includes(k)) pushPrefs();
    if (k === 'anim') applyAppearance();
    toast('Saved', { duration: 1200 });
  });
}

async function changeMaster() {
  modal(`
    <div class="modal-head"><h2>Change master password</h2></div>
    <form class="modal-body" id="cm">
      <div><label class="lbl" for="cm0">Current password</label><input class="input" id="cm0" type="password" autofocus></div>
      <div><label class="lbl" for="cm1">New password</label><input class="input" id="cm1" type="password"><div id="cm-meter" style="margin-top:9px">${meterHTML(-1)}</div></div>
      <div><label class="lbl" for="cm2">Repeat new password</label><input class="input" id="cm2" type="password"><div class="field-err" id="cm-err" hidden></div></div>
    </form>
    <div class="modal-foot"><button class="btn ghost" data-r="0">Cancel</button><button class="btn primary" data-r="1">Change password</button></div>`,
  { cls: 'sm', onMount: (m, close) => {
    $('#cm1', m).addEventListener('input', () => paintMeter($('#cm-meter', m), $('#cm1', m).value, []));
    const go = async () => {
      const err = $('#cm-err', m), a = $('#cm1', m).value;
      err.hidden = true;
      if (a.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
      if (a !== $('#cm2', m).value) { err.textContent = "New passwords don't match."; err.hidden = false; return; }
      const b = m.querySelector('[data-r="1"]'); b.disabled = true; b.innerHTML = '<span class="spinner"></span>Re-encrypting…';
      try {
        await flush();
        await invoke('vault_change_master', { old: $('#cm0', m).value, new: a });
        close(); toast('Master password changed');
      } catch (x) { err.textContent = String(x); err.hidden = false; b.disabled = false; b.textContent = 'Change password'; }
    };
    m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (!b) return; if (b.dataset.r === '1') go(); else close(); });
    $('#cm', m).addEventListener('submit', (ev) => { ev.preventDefault(); go(); });
    m.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } });
  } });
}

const today = () => new Date().toISOString().slice(0, 10);
async function doImport() {
  try {
    const path = await invoke('pick_open', { title: 'Import logins', exts: ['csv', 'json', 'noct', 'txt'] });
    if (!path) return;
    let incoming;
    if (/\.noct$/i.test(path)) {
      const pw = await promptDialog({ title: 'Unlock backup', label: 'Master password of that backup', type: 'password', ok: 'Unlock' });
      if (pw == null) return;
      incoming = JSON.parse(await invoke('decrypt_backup', { path, password: pw })).entries || [];
    } else incoming = parseImport(path, await invoke('read_text', { path }));
    const key = (e) => [String(e.title || '').toLowerCase(), (e.username || e.email || e.phone || '').toLowerCase(), e.password || ''].join('\u0000');
    const have = new Set(entries().map(key));
    const fresh = [];
    for (const raw of incoming) { const e = normalizeEntry({ ...raw, id: undefined }); const k = key(e); if (!have.has(k)) { have.add(k); fresh.push(e); } }
    const dup = incoming.length - fresh.length;
    if (!fresh.length) { toast(incoming.length ? 'Everything in that file is already in your vault' : 'No logins found in that file', { type: 'warn' }); return; }
    if (!(await confirmDialog({ title: `Import ${fresh.length} login${fresh.length > 1 ? 's' : ''}?`, body: `From <b>${esc(path.split(/[\\/]/).pop())}</b>${dup ? `. ${dup} duplicate${dup > 1 ? 's' : ''} will be skipped` : ''}.${/\.(csv|json|txt)$/i.test(path) ? '<br><br>That file holds your passwords in plain text. Delete it once the import is done.' : ''}`, ok: 'Import' }))) return;
    S.vault.entries.push(...fresh);
    save();
    S.filter = null; S.query = '';
    setView('all');
    renderSide();
    toast(`Imported ${fresh.length} login${fresh.length > 1 ? 's' : ''}`);
    await refreshScores(fresh);
    if (set().autoBreach) checkBreaches(fresh, true);
  } catch (x) { toast(String(x.message || x), { type: 'bad', duration: 6000 }); }
}
async function doExport(kind) {
  try {
    if (kind === 'backup') {
      await flush();
      const path = await invoke('pick_save', { title: 'Save encrypted backup', name: `nocturne-backup-${today()}.noct`, exts: ['noct'] });
      if (!path) return;
      await invoke('export_backup', { path });
      toast('Encrypted backup saved', { sub: 'opens with your current master password', duration: 3500 });
      return;
    }
    const ok = await confirmDialog({ title: 'Export without encryption?', body: `The ${kind.toUpperCase()} file will contain <b>every password in plain text</b>. Anyone who gets the file can read it. Use the encrypted backup unless you are moving to another app.`, ok: `Export ${kind.toUpperCase()}`, danger: true });
    if (!ok) return;
    const path = await invoke('pick_save', { title: `Export ${kind.toUpperCase()}`, name: `nocturne-export-${today()}.${kind}`, exts: [kind] });
    if (!path) return;
    const data = kind === 'json' ? JSON.stringify({ nocturne: 1, exported: new Date().toISOString(), entries: entries() }, null, 2) : exportCSV(entries());
    await invoke('write_text', { path, contents: data });
    toast(`Exported ${entries().length} logins`, { sub: 'delete the file when done', duration: 4000 });
  } catch (x) { toast(String(x), { type: 'bad', duration: 5000 }); }
}

// ---------------------------------------------------------------- actions
async function removeEntry(e) {
  const idx = S.vault.entries.indexOf(e);
  if (idx < 0) return;
  S.vault.entries.splice(idx, 1);
  if (S.sel === e.id) S.sel = null;
  save();
  updateList(); renderDetail(); renderSide();
  toast(`${e.title} deleted`, { type: 'info', duration: 7000, action: { label: 'Undo', fn: () => { S.vault.entries.splice(Math.min(idx, S.vault.entries.length), 0, e); S.sel = e.id; save(); setView(S.view); toast('Restored'); } } });
}

const ACT = {
  nav: (b) => { if (b.dataset.view === 'all') { S.filter = null; } setView(b.dataset.view); },
  'browse-tab': (b) => { S.browse = b.dataset.k; renderSide(); },
  'browse-pick': (b) => {
    const v = b.dataset.v;
    S.filter = S.filter && S.filter.kind === S.browse && S.filter.value === v ? null : { kind: S.browse, value: v };
    S.cursor = 0;
    if (S.view !== 'all' && S.view !== 'fav') setView('all'); else { renderSide(); updateList(); }
  },
  'tag-filter': (b) => { S.filter = { kind: 'tag', value: b.dataset.v }; S.browse = 'tag'; setView('all'); },
  'clear-filter': () => { S.filter = null; renderSide(); updateList(); },
  select: (b) => select(b.dataset.id),
  'copy-pw': (b) => { const e = byId(b.dataset.id); copy(e.password, 'Password', { entry: e, btn: b }); },
  'copy-login': (b) => { const e = byId(b.dataset.id); copy(loginOf(e), e.username ? 'Username' : e.email ? 'Email' : 'Phone', { entry: e, btn: b }); },
  'copy-totp': async (b) => { const e = byId(b.dataset.id); const sp = parseTotp(e.totp); if (sp) copy(await totpCode(sp), '2FA code', { entry: e, btn: b.classList.contains('qbtn') ? b : null }); },
  'copy-field': (b) => {
    const e = byId(b.dataset.id), f = b.dataset.f;
    const label = f.startsWith('field:') ? e.fields[+f.slice(6)].label : f.startsWith('hist:') ? 'Old password' : f.startsWith('code:') ? 'Backup code' : FIELD_LABEL[f] || f;
    copy(fieldValue(e, f), label, { entry: f === 'password' ? e : null, btn: b.classList.contains('icon-btn') ? b : null });
    if (f.startsWith('code:')) {
      const i = +f.slice(5);
      if (!e.codes[i].used) setTimeout(() => toast('Used it?', { type: 'info', duration: 6000, action: { label: 'Mark as used', fn: () => { e.codes[i].used = true; save(); renderDetail(); } } }), 50);
    }
  },
  reveal: (b) => { const k = b.dataset.key; S.revealed.has(k) ? S.revealed.delete(k) : S.revealed.add(k); renderDetail(); },
  'open-url': (b) => { const e = byId(b.dataset.id); invoke('open_url', { url: e.url }).catch((x) => toast(String(x), { type: 'bad' })); },
  fav: (b) => { const e = byId(b.dataset.id); e.fav = !e.fav; save(); updateList(); renderDetail(); renderSide(); },
  edit: (b) => openForm(byId(b.dataset.id)),
  delete: (b) => removeEntry(byId(b.dataset.id)),
  'code-used': (b) => { const e = byId(b.dataset.id); const c = e.codes[+b.dataset.i]; c.used = !c.used; save(); renderDetail(); },
  new: () => openForm(),
  'new-from-q': () => openForm(null, { title: S.query.trim() }),
  import: () => doImport(),
  'export-backup': () => doExport('backup'),
  'export-json': () => doExport('json'),
  'export-csv': () => doExport('csv'),
  'change-master': () => changeMaster(),
  lock: () => lockNow(),
  quit: async () => { await flush(); invoke('quit_app'); },
  'g-style': (b) => { S.gen.style = b.dataset.k; set().genStyle = b.dataset.k; save(); renderCenter(); },
  'g-regen': () => regen(),
  'g-copy': () => genCopy(),
  'g-hist': (b) => copy(S.gen.hist[+b.dataset.i], 'Password'),
  'n-gen': () => nickGen(),
  'n-num': (b) => { S.nick.numbers = b.dataset.k; $$('[data-act="n-num"]').forEach((x) => x.classList.toggle('on', x === b)); nickGen(); },
  'n-theme': (b) => {
    const k = b.dataset.k, n = S.nick;
    if (k === '*') n.themes = []; else n.themes = n.themes.includes(k) ? n.themes.filter((x) => x !== k) : [...n.themes, k];
    $$('[data-act="n-theme"]').forEach((x) => x.classList.toggle('on', x.dataset.k === '*' ? !n.themes.length : n.themes.includes(x.dataset.k)));
    nickGen();
  },
  'n-copy': (b) => copy(b.dataset.v, 'Nickname'),
  'n-fav': (b) => {
    const v = b.dataset.v, f = S.vault.nickFavs;
    const i = f.indexOf(v);
    if (i >= 0) f.splice(i, 1); else f.unshift(v);
    S.vault.nickFavs = f.slice(0, 200);
    save(); renderCenter();
  },
  'h-tab': (b) => { S.healthTab = b.dataset.k; renderCenter(); },
  'h-scan': () => checkBreaches(entries()),
  'h-emails': () => checkEmails(),
  'h-open': (b) => { S.sel = b.dataset.id; S.query = ''; S.filter = null; setView('all'); },
};

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || !S.vault || b.closest('#modal-root')) return;
  const fn = ACT[b.dataset.act];
  if (fn) { ev.stopPropagation(); fn(b); }
});
document.addEventListener('dblclick', (ev) => {
  const row = ev.target.closest('.row[data-id]');
  if (row && !ev.target.closest('button') && S.vault) { const e = byId(row.dataset.id); copy(e.password, 'Password', { entry: e }); }
});

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', (ev) => {
  activity();
  if (ev.key === 'Control') document.body.classList.add('ctrl');
  const ov = topModal();
  if (ov) { if (ev.key === 'Escape') { ev.preventDefault(); ov._close(); } return; }
  if (!S.vault) return;
  const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
  const inField = ev.target.matches('input, textarea, select') && ev.target.id !== 'q';
  const listView = S.view === 'all' || S.view === 'fav';

  if (ctrl && !ev.shiftKey && !ev.altKey) {
    const lk = k.toLowerCase();
    if (lk === 'n') { ev.preventDefault(); openForm(); return; }
    if (lk === 'l') { ev.preventDefault(); lockNow(); return; }
    if (lk === 'g') { ev.preventDefault(); setView('generator'); return; }
    if (lk === 'f' || lk === 'k') { ev.preventDefault(); if (!listView) setView('all'); $('#q')?.focus(); $('#q')?.select(); return; }
    if (lk === 'e' && listView && curEntry()) { ev.preventDefault(); openForm(curEntry()); return; }
    if (/^[1-9]$/.test(k) && listView) { ev.preventDefault(); const e = S.results[+k - 1]; if (e) copy(e.password, 'Password', { entry: e, quick: true }); return; }
    return;
  }
  if (inField) return;

  if (listView) {
    if (k === 'ArrowDown') { ev.preventDefault(); moveCursor(1); return; }
    if (k === 'ArrowUp') { ev.preventDefault(); moveCursor(-1); return; }
    if (k === 'PageDown') { ev.preventDefault(); moveCursor(8); return; }
    if (k === 'PageUp') { ev.preventDefault(); moveCursor(-8); return; }
    if (k === 'Enter') {
      ev.preventDefault();
      const e = S.results[S.cursor];
      if (!e) { if (S.query.trim()) openForm(null, { title: S.query.trim() }); return; }
      if (ev.altKey) { const sp = parseTotp(e.totp); if (sp) totpCode(sp).then((cd) => copy(cd, '2FA code', { entry: e, quick: true })); else toast('No 2FA set up for this login', { type: 'warn' }); }
      else if (ev.shiftKey) copy(loginOf(e), e.username ? 'Username' : e.email ? 'Email' : 'Login', { entry: e, quick: true });
      else copy(e.password, 'Password', { entry: e, quick: true });
      return;
    }
    if (k === 'Escape') {
      ev.preventDefault();
      const q = $('#q');
      if (q && q.value) { q.value = ''; S.query = ''; S.cursor = 0; updateList(); q.focus(); }
      else if (S.filter) { S.filter = null; renderSide(); updateList(); }
      else if (S.summoned || set().closeToTray) { S.summoned = false; invoke('hide_window'); }
      return;
    }
    const q = $('#q');
    if (q && document.activeElement !== q && k.length === 1 && !ev.altKey) q.focus();
    return;
  }
  if (S.view === 'generator') {
    if (k === ' ' && !ev.target.matches('button')) { ev.preventDefault(); regen(); }
    else if (k === 'Enter' && !ev.target.matches('button')) { ev.preventDefault(); genCopy(); }
  }
  if (S.view === 'nicknames' && k === ' ' && !ev.target.matches('button')) { ev.preventDefault(); nickGen(); }
  if (k === 'Escape' && !listView) setView('all');
});
document.addEventListener('keyup', (ev) => { if (ev.key === 'Control') document.body.classList.remove('ctrl'); });
window.addEventListener('blur', () => document.body.classList.remove('ctrl'));
['mousemove', 'mousedown', 'wheel'].forEach((t) => document.addEventListener(t, activity, { passive: true }));
document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

// ---------------------------------------------------------------- TOTP ticker
async function tickTotp() {
  if (!S.vault || document.hidden) return;
  const now = Date.now();
  for (const el of $$('[data-totp]')) {
    const e = byId(el.dataset.totp); const sp = e && parseTotp(e.totp);
    if (!sp) continue;
    try { const cd = await totpCode(sp, now); const txt = cd.length === 6 ? cd.slice(0, 3) + ' ' + cd.slice(3) : cd; if (el.textContent !== txt) el.textContent = txt; } catch { el.textContent = 'invalid'; }
  }
  for (const r of $$('[data-ring]')) {
    const e = byId(r.dataset.ring); const sp = e && parseTotp(e.totp);
    if (!sp) continue;
    const rem = totpRemaining(sp, now);
    r.querySelector('.fgc').style.strokeDashoffset = String(50.27 * (1 - rem / sp.period));
    r.classList.toggle('low', rem <= 5);
  }
}
setInterval(tickTotp, 1000);

// ---------------------------------------------------------------- window chrome + boot
$('#tb-min').onclick = () => appWin.minimize();
$('#tb-max').onclick = () => appWin.toggleMaximize();
$('#tb-close').onclick = () => appWin.close();
$('#tb-lock').onclick = () => lockNow();

listen('vault-locked', () => { if (S.vault) hardLock(); });
listen('summon', () => {
  S.summoned = true;
  if (!S.vault) { $('#mp')?.focus(); return; }
  if (topModal()) return;
  if (S.view !== 'all' && S.view !== 'fav') setView('all');
  const q = $('#q');
  if (q) { q.focus(); q.select(); }
});

(async function boot() {
  void WORDS;
  try {
    const st = await invoke('vault_status');
    if (st.exists) renderLock(); else renderSetup();
  } catch (e) {
    $('#app').innerHTML = `<div class="auth"><div class="auth-card glass"><h1>Something broke</h1><p class="sub">${esc(e)}</p></div></div>`;
  }
})();
