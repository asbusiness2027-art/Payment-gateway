'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const proto = require('./protocol101_1');
const transport = require('./transport');

const DB = path.join(__dirname, 'data', 'db.json');
const FLOOR_LIMIT = Number(process.env.OFFLINE_FLOOR_LIMIT || 500); // أقصى مبلغ (جنيه) يتقبل أوفلاين
const KEY = crypto.scryptSync(process.env.VAULT_KEY || 'dev-only-change-me', 'gw-salt', 32);

const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { stan: 0, txs: [], queue: [] }; } };
const save = d => { fs.mkdirSync(path.dirname(DB), { recursive: true }); fs.writeFileSync(DB, JSON.stringify(d, null, 1)); };

// رقم الكارت الكامل بيتشفّر AES-256-GCM وبيتخزن بس لحد ما العملية تتبعت للبنك، وبعدها بيتمسح.
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function unseal(s) {
  const b = Buffer.from(s, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.slice(0, 12));
  d.setAuthTag(b.slice(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.slice(28)), d.final()]).toString('utf8'));
}

const luhn = p => { let s = 0, alt = false; for (let i = p.length - 1; i >= 0; i--) { let n = +p[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
const brand = p => /^4/.test(p) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(p) ? 'Mastercard' : /^(5078|6)/.test(p) ? 'Meeza/Other' : 'Unknown';

function validate({ pan, expiry, amount }) {
  pan = String(pan || '').replace(/\D/g, '');
  if (pan.length < 13 || pan.length > 19 || !luhn(pan)) return 'رقم الكارت غير صحيح';
  const m = /^(\d{2})\/?(\d{2})$/.exec(String(expiry || '').trim());
  if (!m || +m[1] < 1 || +m[1] > 12) return 'تاريخ الانتهاء غير صحيح (MM/YY)';
  if (new Date(2000 + +m[2], +m[1], 1) <= new Date()) return 'الكارت منتهي';
  if (!(Number(amount) > 0) || Number(amount) > 1e6) return 'المبلغ غير صحيح';
  return null;
}
const messages = { '00': 'تمت الموافقة', '05': 'مرفوضة من البنك', '51': 'الرصيد أو الحد غير كافي', '91': 'البنك غير متاح', Z1: 'مرفوضة: المبلغ أكبر من حد القبول أوفلاين' };

async function pay({ pan, expiry, amount }) {
  const err = validate({ pan, expiry, amount });
  if (err) return { ok: false, error: err };
  pan = String(pan).replace(/\D/g, ''); const exp = String(expiry).replace('/', '');
  const yymm = exp.slice(2) + exp.slice(0, 2);
  const db = load(); db.stan = (db.stan % 999999) + 1;
  const now = new Date();
  const tx = {
    id: crypto.randomUUID(), createdAt: now.toISOString(), stan: db.stan,
    rrn: now.toISOString().slice(2, 4) + String(Math.floor((now - new Date(now.getUTCFullYear(), 0, 0)) / 864e5)).padStart(3, '0') + String(db.stan).padStart(6, '0') + String(now.getUTCHours() % 10),
    first6: pan.slice(0, 6), last4: pan.slice(-4), brand: brand(pan),
    amount: Number(amount), amountMinor: Math.round(Number(amount) * 100), currency: 'EGP',
  };
  try {
    const raw = proto.buildRequest(tx, pan, yymm, 'auth');
    const r = proto.parseResponse(await transport.send(raw));
    Object.assign(tx, { mode: 'online', responseCode: r.responseCode, authCode: r.authCode, status: r.responseCode === '00' ? 'approved' : 'declined' });
  } catch (e) {
    // مفيش اتصال => مسار الأوفلاين (Store & Forward)
    if (tx.amount <= FLOOR_LIMIT) {
      Object.assign(tx, { mode: 'offline', responseCode: 'Y1', status: 'pending_sync' });
      db.queue.push({ id: tx.id, vault: seal({ pan, yymm }) });
    } else Object.assign(tx, { mode: 'offline', responseCode: 'Z1', status: 'declined' });
  }
  tx.message = messages[tx.responseCode] || (tx.status === 'pending_sync' ? 'تم القبول أوفلاين وهتتبعت للبنك عند عودة الاتصال' : 'مرفوضة');
  delete tx.amountMinor; db.txs.unshift(tx); save(db);
  const { stan, ...pub } = tx; return { ok: tx.status !== 'declined', tx: pub };
}

async function sync() {
  const db = load(); let done = 0, failed = 0;
  for (const q of [...db.queue]) {
    const tx = db.txs.find(t => t.id === q.id); if (!tx) { db.queue = db.queue.filter(x => x !== q); continue; }
    try {
      const { pan, yymm } = unseal(q.vault);
      const r = proto.parseResponse(await transport.send(proto.buildRequest({ ...tx, amountMinor: Math.round(tx.amount * 100) }, pan, yymm, 'advice')));
      Object.assign(tx, { responseCode: r.responseCode, authCode: r.authCode, syncedAt: new Date().toISOString(),
        status: r.responseCode === '00' ? 'approved' : 'declined_after_offline', message: messages[r.responseCode] || 'مرفوضة بعد المزامنة' });
      db.queue = db.queue.filter(x => x !== q); done++;   // الرقم الكامل اتمسح من التخزين
    } catch { failed++; break; }
  }
  save(db); return { synced: done, failed, remaining: db.queue.length };
}

const list = () => { const d = load(); return { txs: d.txs.slice(0, 100).map(({ stan, ...t }) => t), pending: d.queue.length }; };
module.exports = { pay, sync, list, transport, FLOOR_LIMIT };
