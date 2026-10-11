const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/game-theme.css': 'game-theme.css', '/maple-theme.css': 'maple-theme.css', '/assets/maple-autumn.jpg': 'assets/maple-autumn.jpg', '/assets/maple-scene.jpg': 'assets/maple-scene.jpg', '/assets/maple-character.png': 'assets/maple-character.png', '/assets/meso.png': 'assets/meso.png', '/assets/fonts/Maplestory-Light.ttf': 'assets/fonts/Maplestory-Light.ttf', '/assets/fonts/Maplestory-Bold.ttf': 'assets/fonts/Maplestory-Bold.ttf' };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) { res.writeHead(500); return res.end('Could not read file'); }
    res.writeHead(200, { 'Content-Type': `${types[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(data);
  });
});
server.listen(5173, '127.0.0.1', () => console.log('Maplelog: http://127.0.0.1:5173'));
