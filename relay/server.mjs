import http from 'node:http';
import crypto from 'node:crypto';

const port = Number(process.env.PORT || 8787);
const secret = process.env.RELAY_SECRET || '';
const allowedHosts = new Set((process.env.ALLOWED_HOSTS || 'neo.vpbank.com.vn,asia-east2-vpbank-online-new---prod.cloudfunctions.net').split(',').map(v => v.trim()).filter(Boolean));
const maxBodyBytes = 1024 * 1024;
const forwardedRequestHeaders = new Set(['accept', 'content-type', 'authkey', 'tokenfb', 'user-agent', 'origin', 'referer', 'x-api-token']);
const forwardedResponseHeaders = new Set(['content-type', 'content-length', 'location', 'cache-control', 'etag', 'last-modified']);

if (secret.length < 24) {
  console.error('RELAY_SECRET must contain at least 24 characters');
  process.exit(1);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function authorized(req) {
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!supplied || supplied.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
  if (req.method !== 'POST' || req.url !== '/v1/fetch') return send(res, 404, { error: 'Not found' });
  if (!authorized(req)) return send(res, 401, { error: 'Unauthorized' });

  try {
    const input = await readJson(req);
    const target = new URL(String(input.target || ''));
    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || target.username || target.password) {
      return send(res, 400, { error: 'Target is not allowed' });
    }
    const method = String(input.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) return send(res, 400, { error: 'Method is not allowed' });

    const headers = {};
    for (const [key, value] of Object.entries(input.headers || {})) {
      if (forwardedRequestHeaders.has(key.toLowerCase()) && typeof value === 'string') headers[key] = value;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let upstream;
    try {
      upstream = await fetch(target, {
        method,
        headers,
        body: method === 'POST' && typeof input.body === 'string' ? input.body : undefined,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const responseBody = Buffer.from(await upstream.arrayBuffer());
    if (responseBody.length > 5 * 1024 * 1024) return send(res, 502, { error: 'Upstream response is too large' });
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (forwardedResponseHeaders.has(key.toLowerCase())) responseHeaders[key] = value;
    });
    return send(res, 200, { status: upstream.status, headers: responseHeaders, body: responseBody.toString('base64') });
  } catch (error) {
    console.error(new Date().toISOString(), error?.message || error);
    return send(res, 502, { error: error?.name === 'AbortError' ? 'VPBank request timed out' : (error?.message || 'Relay failed') });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`VPBank relay listening on :${port}`));
