'use strict';
// ==== طبقة البروتوكول (Adapter) ====
// هنا بس هيتغير الكود لما توصلك مواصفات "101.1" الحقيقية من البنك/المزوّد.
// باقي النظام (البوابة، الأوفلاين، الداشبورد) بيتعامل مع الدالتين دول بس.
const iso = require('./iso8583');
const POS_ENTRY = process.env.POS_ENTRY_MODE || '012'; // 01x = إدخال يدوي للرقم
const pad = (n, l) => String(n).padStart(l, '0');

function buildRequest(tx, pan, expiryYYMM, kind /* 'auth' | 'advice' */) {
  const d = new Date(tx.createdAt);
  const date = pad(d.getUTCMonth() + 1, 2) + pad(d.getUTCDate(), 2);
  const time = pad(d.getUTCHours(), 2) + pad(d.getUTCMinutes(), 2) + pad(d.getUTCSeconds(), 2);
  return iso.pack(kind === 'advice' ? '0220' : '0200', {
    2: pan, 3: '000000', 4: String(tx.amountMinor), 7: date + time, 11: pad(tx.stan, 6),
    12: time, 13: date, 14: expiryYYMM, 22: POS_ENTRY, 37: tx.rrn,
    41: process.env.TERMINAL_ID || 'TERM0001', 42: process.env.MERCHANT_ID || 'MERCHANT0000001', 49: '818',
  });
}
function parseResponse(raw) {
  const { mti, fields } = iso.unpack(raw);
  return { mti, responseCode: fields[39], authCode: fields[38] || null };
}
module.exports = { buildRequest, parseResponse };
