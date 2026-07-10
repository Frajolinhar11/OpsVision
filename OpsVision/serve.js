const http = require('http');
const fs = require('fs');
const path = require('path');

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

http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
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
  console.log(`OPS Vision rodando em http://localhost:${PORT}`);
  console.log(`Acesse via celular na rede local: http://SEU_IP:${PORT}`);
});
