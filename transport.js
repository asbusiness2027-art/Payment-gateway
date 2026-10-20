'use strict';
const net = require('net');
const iso = require('./iso8583');

// ---- Sandbox: بنك وهمي بيرد حسب قواعد بسيطة للتجربة ----
// مبلغ > 50,000 جنيه => 51 | كارت ينتهي بـ 0000 => 05 | ينتهي بـ 1111 => 91 (البنك مش متاح) | غير كده => 00
const sandbox = {
  online: true,
  async send(raw) {
    if (!this.online) throw new Error('NETWORK_DOWN');
    const { fields } = iso.unpack(raw);
    const pan = fields[2], amount = Number(fields[4]);
    let rc = '00';
    if (amount > 5000000) rc = '51'; else if (pan.endsWith('0000')) rc = '05'; else if (pan.endsWith('1111')) rc = '91';
    const out = { 3: fields[3], 4: fields[4], 11: fields[11], 37: fields[37], 39: rc, 41: fields[41], 42: fields[42] };
    if (rc === '00') out[38] = String(Math.floor(100000 + Math.random() * 899999));
    return iso.pack('0210', out);
  },
};

// ---- حقيقي: TCP بهيدر طوله 2 بايت (عدّله حسب مواصفات الجهة) ----
const tcp = {
  online: true,
  send(raw) {
    return new Promise((resolve, reject) => {
      const s = net.connect({ host: process.env.ACQUIRER_HOST, port: +process.env.ACQUIRER_PORT });
      const buf = Buffer.from(raw, 'ascii'); const hdr = Buffer.alloc(2); hdr.writeUInt16BE(buf.length);
      s.setTimeout(30000, () => { s.destroy(); reject(new Error('TIMEOUT')); });
      s.on('connect', () => s.write(Buffer.concat([hdr, buf])));
      s.on('data', d => { s.end(); resolve(d.slice(2).toString('ascii')); });
      s.on('error', reject);
    });
  },
};
module.exports = process.env.ACQUIRER_HOST ? tcp : sandbox;
