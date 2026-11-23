const B = 'http://localhost:3000';
const j = (r) => r.json();
async function reg(n) {
  const r = await fetch(B + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) });
  return j(r);
}
const api = (t, p, opt = {}) => fetch(B + '/api' + p, { method: opt.method || 'GET', headers: { 'content-type': 'application/json', 'x-token': t }, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(j);

(async () => {
  const a = await reg('Suit' + Date.now() % 1e4);
  const b = await reg('SuitB' + Date.now() % 1e4);
  const pair = await api(a.token, '/pair/create', { method: 'POST' });
  await api(b.token, '/pair/join', { method: 'POST', body: { code: pair.code } });
  console.log('paired:', pair.code);

  // feed: bikin aktivitas dulu
  await api(a.token, '/note', { method: 'POST', body: { text: 'jangan lupa makan ya' } });
  await api(a.token, '/daily/answer', { method: 'POST', body: { text: 'jawaban a' } });
  await api(a.token, '/bucket', { method: 'POST', body: { text: 'nonton aurora bareng' } });
  const home = await api(b.token, '/home');
  console.log('FEED:', home.feed?.length, 'items');
  (home.feed || []).forEach(f => console.log(' -', f.who + ':', f.text, `(${f.type})`));

  // weather
  const wx = await api(a.token, '/weather');
  console.log('WEATHER:', JSON.stringify(wx));

  // AI memory: ingat
  const m1 = await api(a.token, '/ai/chat', { method: 'POST', body: { message: 'ingat ya aku suka banget matcha' } });
  console.log('MEM reply:', m1.source, '-', m1.reply?.slice(0, 70));
  // cek fakta kepake di konteks: tanya balik
  const m2 = await api(a.token, '/ai/chat', { method: 'POST', body: { message: 'aku suka minuman apa?' } });
  console.log('MEM test:', m2.source, '-', m2.reply?.slice(0, 100));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
