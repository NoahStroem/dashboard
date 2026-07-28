// Shared helpers for the WHOOP OAuth serverless functions (Vercel, Node runtime).
// The client secret lives only here (server-side, from env). Tokens are kept in
// httpOnly cookies — never exposed to the browser. No database required.
const crypto = require('crypto');

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer';
const SCOPE = 'read:recovery read:sleep read:cycles read:profile offline';

function getOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}
function redirectUri(req) { return getOrigin(req) + '/api/whoop/callback'; }
function isHttps(req) { return getOrigin(req).startsWith('https'); }

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function cookie(name, val, opts) {
  opts = opts || {};
  let s = name + '=' + encodeURIComponent(val) + '; Path=/; HttpOnly; SameSite=Lax';
  if (opts.secure !== false) s += '; Secure';
  if (opts.maxAge != null) s += '; Max-Age=' + opts.maxAge;
  return s;
}
function clearCookie(name, secure) {
  return name + '=; Path=/; HttpOnly; SameSite=Lax' + (secure !== false ? '; Secure' : '') + '; Max-Age=0';
}

function creds() {
  // .trim() guards against stray spaces / newlines pasted into the Vercel env var,
  // which otherwise produce a WHOOP "invalid_client" error.
  const id = (process.env.WHOOP_CLIENT_ID || '').trim(), secret = (process.env.WHOOP_CLIENT_SECRET || '').trim();
  if (!id || !secret) { const e = new Error('WHOOP_NOT_CONFIGURED'); e.code = 'WHOOP_NOT_CONFIGURED'; throw e; }
  return { id, secret };
}
async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('token ' + r.status + ' ' + (j.error_description || j.error || '')); e.status = r.status; throw e; }
  return j;
}

module.exports = { crypto, AUTH_URL, TOKEN_URL, API_BASE, SCOPE, getOrigin, redirectUri, isHttps, parseCookies, cookie, clearCookie, creds, tokenRequest };
