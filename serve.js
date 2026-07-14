const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// AI Key Test
function handleAITest(req, res, body) {
  try {
    const { apiKey } = JSON.parse(body);
    if (!apiKey) { res.writeHead(400, CORS_HEADERS); res.end(JSON.stringify({ error: 'API key não informada' })); return; }
    const opts = { hostname: 'api.groq.com', path: '/openai/v1/models', method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey } };
    const r = https.request(opts, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => { res.writeHead(apiRes.statusCode === 200 ? 200 : 401, { 'Content-Type': 'application/json', ...CORS_HEADERS }); res.end(JSON.stringify({ valid: apiRes.statusCode === 200 })); });
    });
    r.on('error', e => { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: e.message })); });
    r.end();
  } catch (e) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: e.message })); }
}

// AI Proxy — forwards chat requests to Groq (OpenAI-compatible)
function handleAI(req, res, body) {
  try {
    const { messages, systemPrompt, apiKey, model } = JSON.parse(body);
    if (!apiKey) { res.writeHead(400, CORS_HEADERS); res.end(JSON.stringify({ error: 'API key não configurada' })); return; }
    if (!messages || !messages.length) { res.writeHead(400, CORS_HEADERS); res.end(JSON.stringify({ error: 'Mensagens vazias' })); return; }

    const requestBody = JSON.stringify({
      model: model || 'llama-3.1-8b-instant',
      messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
      temperature: 0.3, max_tokens: 2000,
    });
    const opts = {
      hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(requestBody) },
    };
    const r = https.request(opts, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => {
        if (apiRes.statusCode === 429) {
          try { const j = JSON.parse(d); res.writeHead(429, CORS_HEADERS); res.end(JSON.stringify({ error: j.error?.message || '429' })); } catch(e) { res.writeHead(429, CORS_HEADERS); res.end(JSON.stringify({ error: '429' })); }
          return;
        }
        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(d);
      });
    });
    r.on('error', e => { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: e.message })); });
    r.write(requestBody);
    r.end();
  } catch (e) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: e.message })); }
}

http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // File upload endpoint (base64 JSON)
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, data: b64 } = JSON.parse(body);
        if (!name || !b64) { res.writeHead(400, CORS_HEADERS); res.end(JSON.stringify({ error: 'Nome e arquivo obrigatórios' })); return; }
        const uploadDir = path.join(ROOT, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const ext = path.extname(name) || '';
        const safeName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
        const filePath = path.join(uploadDir, safeName);
        fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(JSON.stringify({ url: '/uploads/' + safeName, name: safeName }));
      } catch (e) { res.writeHead(500, CORS_HEADERS); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }

  // AI proxy endpoints
  const p = req.url.split('?')[0];
  if (req.method === 'POST' && p === '/api/ai/test') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => handleAITest(req, res, body));
    return;
  }
  if (req.method === 'POST' && p === '/api/ai') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => handleAI(req, res, body));
    return;
  }

  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403, CORS_HEADERS); res.end(); return; }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // For SPA-like paths, serve index.html
        if (!ext) {
          const index = path.join(ROOT, 'index.html');
          fs.readFile(index, (e2, d2) => {
            if (e2) { res.writeHead(404, CORS_HEADERS); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', ...CORS_HEADERS });
            res.end(d2);
          });
          return;
        }
        res.writeHead(404, CORS_HEADERS);
        res.end('Not found');
      } else {
        res.writeHead(500, CORS_HEADERS);
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType, ...CORS_HEADERS });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('OpsVision server running at http://localhost:' + PORT);
});
