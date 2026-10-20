'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const gw = require('./gateway');
const API_KEY = process.env.API_KEY || 'dev-key';
const PORT = process.env.PORT || 3000;
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e4) { req.destroy(); no(new Error('big')); } }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      if (req.headers['x-api-key'] !== API_KEY) return json(res, 401, { error: 'مفتاح API غير صحيح' });
      if (req.method === 'POST' && req.url === '/api/pay') { const r = await gw.pay(await body(req)); return json(res, r.ok || r.tx ? 200 : 400, r); }
      if (req.method === 'GET' && req.url === '/api/transactions') return json(res, 200, { ...gw.list(), online: gw.transport.online, floorLimit: gw.FLOOR_LIMIT });
      if (req.method === 'POST' && req.url === '/api/sync') return json(res, 200, await gw.sync());
      if (req.method === 'POST' && req.url === '/api/network') { gw.transport.online = !!(await body(req)).online; return json(res, 200, { online: gw.transport.online }); }
      return json(res, 404, { error: 'not found' });
    }
    const f = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : path.basename(req.url));
    fs.readFile(f, (e, d) => e ? (res.writeHead(404), res.end()) : (res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }), res.end(d)));
  } catch { json(res, 400, { error: 'طلب غير صحيح' }); }
}).listen(PORT, () => console.log('Gateway on http://localhost:' + PORT));
