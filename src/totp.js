// RFC 6238 TOTP via WebCrypto. Accepts a base32 secret or an otpauth:// URI.

export function parseTotp(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  let secret = s, digits = 6, period = 30, algo = 'SHA-1';
  if (/^otpauth:/i.test(s)) {
    try {
      const u = new URL(s);
      secret = u.searchParams.get('secret') || '';
      digits = parseInt(u.searchParams.get('digits') || '6', 10) || 6;
      period = parseInt(u.searchParams.get('period') || '30', 10) || 30;
      const a = (u.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      algo = a === 'SHA256' ? 'SHA-256' : a === 'SHA512' ? 'SHA-512' : 'SHA-1';
    } catch { return null; }
  }
  secret = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]{8,}$/.test(secret)) return null;
  return { secret, digits: Math.min(10, Math.max(6, digits)), period: Math.max(5, period), algo };
}

function base32(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0;
  const out = [];
  for (const c of s) {
    val = ((val << 5) | A.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

const keyCache = new Map();
const codeCache = new Map();

export async function totpCode(spec, now = Date.now()) {
  const counter = Math.floor(now / 1000 / spec.period);
  const ck = spec.secret + '|' + spec.algo + '|' + spec.digits + '|' + spec.period + '|' + counter;
  if (codeCache.has(ck)) return codeCache.get(ck);
  let key = keyCache.get(spec.secret + spec.algo);
  if (!key) {
    key = await crypto.subtle.importKey('raw', base32(spec.secret), { name: 'HMAC', hash: spec.algo }, false, ['sign']);
    keyCache.set(spec.secret + spec.algo, key);
  }
  const msg = new ArrayBuffer(8);
  const dv = new DataView(msg);
  dv.setUint32(0, Math.floor(counter / 0x100000000));
  dv.setUint32(4, counter >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = sig[sig.length - 1] & 15;
  const bin = ((sig[o] & 127) << 24) | (sig[o + 1] << 16) | (sig[o + 2] << 8) | sig[o + 3];
  const code = String(bin % 10 ** spec.digits).padStart(spec.digits, '0');
  if (codeCache.size > 500) codeCache.clear();
  codeCache.set(ck, code);
  return code;
}

export function totpRemaining(spec, now = Date.now()) {
  const p = spec.period * 1000;
  return (p - (now % p)) / 1000;
}

export function clearTotpCaches() { keyCache.clear(); codeCache.clear(); }
