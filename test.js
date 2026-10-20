const gw = require('./gateway'); const t = gw.transport;
(async () => {
  const c = { pan: '4111 1111 1111 1111'.replace(/ /g,''), expiry: '12/30' };
  const ok = '4242424242424242';
  console.log('bad card   ', (await gw.pay({ pan: '4111111111111112', expiry: '12/30', amount: 10 })).error);
  console.log('online ok  ', (await gw.pay({ pan: ok, expiry: '12/30', amount: 100 })).tx.status);
  console.log('declined 51', (await gw.pay({ pan: ok, expiry: '12/30', amount: 60000 })).tx.responseCode);
  t.online = false;
  console.log('offline ok ', (await gw.pay({ pan: ok, expiry: '12/30', amount: 200 })).tx.status);
  console.log('offline big', (await gw.pay({ pan: ok, expiry: '12/30', amount: 900 })).tx.responseCode);
  console.log('sync down  ', await gw.sync());
  t.online = true;
  console.log('sync up    ', await gw.sync());
  const raw = require('fs').readFileSync('data/db.json', 'utf8');
  console.log('PAN in db? ', raw.includes(ok));
})();
