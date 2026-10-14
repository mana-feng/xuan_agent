const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.CHART_DRAFT_PORT || 4175);
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const files = { '/': ['index.html','text/html'], '/index.html': ['index.html','text/html'], '/engines.js': ['engines.js','text/javascript'], '/engines.js.LEGAL.txt': ['engines.js.LEGAL.txt','text/plain'] };
  const entry = files[pathname];
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  fs.readFile(path.join(__dirname, entry[0]), (error, content) => {
    if (error) { res.writeHead(500); res.end('Preview unavailable'); return; }
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(content);
  });
}).listen(port, '127.0.0.1', () => console.log(`Chart draft: http://127.0.0.1:${port}/`));
