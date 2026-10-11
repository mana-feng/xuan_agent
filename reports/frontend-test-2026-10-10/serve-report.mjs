import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.toon': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'report.html';
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) || !mime[path.extname(target)]) {
      res.writeHead(404).end('Not found');
      return;
    }
    const bytes = await fs.readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(3002, '127.0.0.1', () => console.log('Report preview: http://127.0.0.1:3002/report.html'));
