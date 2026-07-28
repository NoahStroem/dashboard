// Shared helpers for the Fitbit OAuth serverless functions (Vercel, Node runtime).
// Mirrors api/whoop/_lib.js. The client secret lives only here (server-side, from
// env). Tokens are kept in httpOnly cookies — never exposed to the browser.
// Difference vs WHOOP: Fitbit's token endpoint authenticates with an HTTP Basic
// header (base64 of client_id:client_secret), not body params.
const crypto = require('crypto');

const AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const API_BASE = 'https://api.fitbit.com';
const SCOPE = 'sleep heartrate profile';

function getOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return proto + '://' + host;
}
function redirectUri(req) { return getOrigin(req) + '/api/fitbit/callback'; }
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
  const id = process.env.FITBIT_CLIENT_ID, secret = process.env.FITBIT_CLIENT_SECRET;
  if (!id || !secret) { const e = new Error('FITBIT_NOT_CONFIGURED'); e.code = 'FITBIT_NOT_CONFIGURED'; throw e; }
  return { id, secret };
}
// Fitbit token requests use HTTP Basic auth (client_id:client_secret), unlike WHOOP.
async function tokenRequest(params) {
  const { id, secret } = creds();
  const basic = Buffer.from(id + ':' + secret).toString('base64');
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + basic,
    },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.errors && j.errors[0] && j.errors[0].message) || j.error_description || j.error || '';
    const e = new Error('token ' + r.status + ' ' + msg); e.status = r.status; throw e;
  }
  return j;
}

module.exports = { crypto, AUTH_URL, TOKEN_URL, API_BASE, SCOPE, getOrigin, redirectUri, isHttps, parseCookies, cookie, clearCookie, creds, tokenRequest };
