'use strict';
// ISO 8583 (ASCII, primary bitmap فقط) - مناسب للـ Sandbox. عدّل SPEC حسب مواصفات الجهة الفعلية.
const SPEC = {
  2: { t: 'llvar' }, 3: { t: 'n', l: 6 }, 4: { t: 'n', l: 12 }, 7: { t: 'n', l: 10 },
  11: { t: 'n', l: 6 }, 12: { t: 'n', l: 6 }, 13: { t: 'n', l: 4 }, 14: { t: 'n', l: 4 },
  22: { t: 'n', l: 3 }, 37: { t: 'an', l: 12 }, 38: { t: 'an', l: 6 }, 39: { t: 'an', l: 2 },
  41: { t: 'an', l: 8 }, 42: { t: 'an', l: 15 }, 49: { t: 'n', l: 3 },
};

function pack(mti, f) {
  let bm = 0n, body = '';
  for (const k of Object.keys(f).map(Number).sort((a, b) => a - b)) {
    const s = SPEC[k]; if (!s) throw new Error('Field ' + k + ' not in SPEC');
    const v = String(f[k]); bm |= 1n << BigInt(64 - k);
    if (s.t === 'llvar') body += String(v.length).padStart(2, '0') + v;
    else if (v.length > s.l) throw new Error('Field ' + k + ' too long');
    else body += s.t === 'n' ? v.padStart(s.l, '0') : v.padEnd(s.l, ' ');
  }
  return mti + bm.toString(16).padStart(16, '0').toUpperCase() + body;
}

function unpack(raw) {
  const mti = raw.slice(0, 4), bm = BigInt('0x' + raw.slice(4, 20));
  let p = 20; const f = {};
  for (let k = 1; k <= 64; k++) {
    if (!(bm & (1n << BigInt(64 - k)))) continue;
    const s = SPEC[k]; if (!s) throw new Error('Unknown field ' + k);
    if (s.t === 'llvar') { const n = +raw.slice(p, p + 2); f[k] = raw.slice(p + 2, p + 2 + n); p += 2 + n; }
    else { f[k] = raw.slice(p, p + s.l); p += s.l; if (s.t === 'an') f[k] = f[k].trimEnd(); }
  }
  return { mti, fields: f };
}
module.exports = { pack, unpack };
