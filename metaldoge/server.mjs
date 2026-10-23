import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const UPSTREAM = (process.env.UPSTREAM || 'https://metaldoge.com').replace(/\/$/, '');
const ALLOWED = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://dogedrop.org,https://www.dogedrop.org,https://qlpqlp.github.io')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);
const ADDRESS = /^D[1-9A-HJ-NP-Za-km-z]{25,40}$/;
const HEX64 = /^[0-9a-fA-F]{64}$/;
const HEX = /^[0-9a-fA-F]+$/;
const WINDOW_MS = 60_000;
const LIMIT = 120;
const hits = new Map();

if (!/^https:\/\//i.test(UPSTREAM)) {
  throw new Error('UPSTREAM must be an https address.');
}

function clientIp(request) {
  const remote = request.socket.remoteAddress || '';
  const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  if (process.env.TRUST_PROXY === '1' && local) {
    const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return remote || 'unknown';
}

function allowed(request) {
  const now = Date.now();
  const ip = clientIp(request);
  const recent = (hits.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function originAllowed(origin) {
  return Boolean(origin && ALLOWED.has(origin));
}

function writeJson(response, status, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  if (originAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 262144) {
        reject(new Error('too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function route(method, path) {
  if (method === 'GET' && path === '/healthz') return { name: 'health' };
  if (method === 'GET' && path === '/api/info') return { name: 'info', upstream: '/api/info' };
  const address = path.match(/^\/api\/address\/([^/]+)$/);
  if (method === 'GET' && address && ADDRESS.test(decodeURIComponent(address[1]))) {
    return { name: 'address', upstream: `/api/address/${encodeURIComponent(decodeURIComponent(address[1]))}` };
  }
  const tx = path.match(/^\/api\/tx\/([^/]+)$/);
  if (method === 'GET' && tx && HEX64.test(tx[1])) return { name: 'tx', upstream: `/api/tx/${tx[1]}` };
  if (method === 'POST' && path === '/api/tx') return { name: 'send', upstream: '/api/tx' };
  return null;
}

async function forward(target, init) {
  const response = await fetch(target, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  return { status: response.status, text };
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (request.method === 'OPTIONS') {
    if (!originAllowed(origin)) {
      writeJson(response, 403, { error: 'This website is not allowed.' }, '');
      return;
    }
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
      'Cache-Control': 'no-store',
    });
    response.end();
    return;
  }
  if (!allowed(request)) {
    writeJson(response, 429, { error: 'Too many requests. Wait a moment.' }, origin);
    return;
  }
  const match = route(request.method, url.pathname);
  if (!match) {
    writeJson(response, 404, { error: 'Not found.' }, origin);
    return;
  }
  if (match.name !== 'health' && !originAllowed(origin)) {
    writeJson(response, 403, { error: 'This website is not allowed.' }, '');
    return;
  }
  if (match.name === 'health') {
    writeJson(response, 200, { ok: true }, origin);
    return;
  }
  let body;
  if (match.name === 'send') {
    try {
      const parsed = JSON.parse(await readBody(request));
      const hex = String(parsed.hex || '');
      if (!HEX.test(hex) || hex.length < 20 || hex.length % 2 !== 0) {
        writeJson(response, 400, { error: 'The payment hex is not valid.' }, origin);
        return;
      }
      body = JSON.stringify({ hex });
    } catch {
      writeJson(response, 400, { error: 'The payment body is not valid.' }, origin);
      return;
    }
  }
  try {
    const result = await forward(`${UPSTREAM}${match.upstream}`, {
      method: request.method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
    });
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    };
    if (originAllowed(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept';
    }
    response.writeHead(result.status, headers);
    response.end(result.text);
  } catch {
    writeJson(response, 502, { error: 'The DogecoinVM explorer did not answer.' }, origin);
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`DogecoinVM bridge listening on http://${HOST}:${PORT}\n`);
});
