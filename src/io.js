// Import / export parsing. Understands CSV exports from Chrome, Edge, Brave,
// Firefox, Bitwarden, 1Password, LastPass, Proton Pass and generic files,
// Bitwarden JSON, and Nocturne's own JSON.

export function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const COLS = {
  title: ['name', 'title', 'service', 'site', 'account', 'item name'],
  url: ['url', 'login_uri', 'website', 'web site', 'uri', 'urls', 'link', 'login url', 'hostname'],
  login: ['username', 'login_username', 'login', 'user', 'user name', 'login name'],
  email: ['email', 'e-mail', 'mail', 'email address'],
  phone: ['phone', 'phone number', 'mobile', 'tel'],
  password: ['password', 'login_password', 'pass', 'pwd'],
  totp: ['totp', 'login_totp', 'otpauth', 'otp', 'one-time password', '2fa', 'otp secret'],
  notes: ['notes', 'note', 'extra', 'comments', 'comment'],
  tags: ['folder', 'grouping', 'category', 'tags', 'group', 'vault'],
  fav: ['favorite', 'fav', 'favourite'],
};
const SKIP = new Set(['type', 'httprealm','formactionorigin', 'guid', 'timecreated', 'timelastused', 'timepasswordchanged', 'reprompt', 'fields', 'createtime', 'modifytime']);

export function hostOf(url) {
  if (!url) return '';
  try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function titleFromUrl(url) {
  const h = hostOf(url);
  if (!h) return '';
  const parts = h.split('.');
  const core = parts.length > 2 && parts.at(-2).length <= 3 ? parts.at(-3) : parts.at(-2) || parts[0];
  return core ? core[0].toUpperCase() + core.slice(1) : h;
}

export function detectLoginType(v) {
  const s = (v || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email';
  if (/^\+?[\d\s().-]{7,}$/.test(s) && (s.match(/\d/g) || []).length >= 7) return 'phone';
  return 'username';
}

function fromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex((h) => names.includes(h));
  if (idx.password < 0 && idx.login < 0 && idx.url < 0) throw new Error('Could not find password, username or URL columns in this CSV.');
  const used = new Set(Object.values(idx).filter((i) => i >= 0));
  const out = [];
  for (const r of rows.slice(1)) {
    const g = (k) => (idx[k] >= 0 ? (r[idx[k]] || '').trim() : '');
    const e = { url: g('url'), password: r[idx.password] ?? '', totp: g('totp'), notes: g('notes'), title: g('title') };
    const login = g('login');
    if (login) e[detectLoginType(login)] = login;
    if (g('email') && !e.email) e.email = g('email');
    if (g('phone') && !e.phone) e.phone = g('phone');
    const tag = g('tags');
    if (tag && !['login', '1', 'note'].includes(tag.toLowerCase())) e.tags = [tag];
    if (['1', 'true', 'yes'].includes(g('fav').toLowerCase())) e.fav = true;
    e.fields = [];
    head.forEach((h, i) => {
      if (used.has(i) || SKIP.has(h.replace(/\s/g, '')) || !r[i] || !r[i].trim()) return;
      e.fields.push({ label: rows[0][i].trim(), value: r[i].trim(), secret: /pin|secret|answer|key|code/i.test(h) });
    });
    if (!e.title) e.title = titleFromUrl(e.url) || e.username || e.email || 'Imported';
    if (!e.password && !e.username && !e.email && !e.url) continue;
    out.push(e);
  }
  return out;
}

function fromBitwardenJSON(j) {
  return (j.items || []).filter((it) => it.login || it.type === 1).map((it) => {
    const l = it.login || {};
    const e = { title: it.name || '', url: (l.uris && l.uris[0] && l.uris[0].uri) || '', password: l.password || '', totp: l.totp || '', notes: it.notes || '', fav: !!it.favorite };
    if (l.username) e[detectLoginType(l.username)] = l.username;
    e.fields = (it.fields || []).filter((f) => f.value).map((f) => ({ label: f.name || 'Field', value: String(f.value), secret: f.type === 1 }));
    if (!e.title) e.title = titleFromUrl(e.url) || 'Imported';
    return e;
  });
}

/** Returns array of partial entries. Throws with a readable message on failure. */
export function parseImport(name, text) {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    let j;
    try { j = JSON.parse(t); } catch { throw new Error('This JSON file is not valid.'); }
    if (j && j.nocturne && Array.isArray(j.entries)) return j.entries;
    if (j && Array.isArray(j.entries) && j.v) return j.entries;
    if (j && Array.isArray(j.items)) return fromBitwardenJSON(j);
    if (j && j.encrypted) throw new Error('This is an encrypted export from another app. Export it unencrypted (CSV or JSON) and try again.');
    throw new Error('Unknown JSON format.');
  }
  return fromCSV(t);
}

export function exportCSV(entries) {
  const rows = [['name', 'url', 'username', 'email', 'phone', 'password', 'totp', 'note', 'tags', 'extra_fields', 'backup_codes']];
  for (const e of entries) {
    rows.push([
      e.title, e.url, e.username, e.email, e.phone, e.password, e.totp, e.notes,
      (e.tags || []).join('; '),
      (e.fields || []).map((f) => `${f.label}: ${f.value}`).join(' | '),
      (e.codes || []).filter((c) => !c.used).map((c) => c.c).join(' '),
    ]);
  }
  return toCSV(rows);
}
