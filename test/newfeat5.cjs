const B = 'http://localhost:3000';
const j = (r) => r.json();
async function reg(n) {
  const r = await fetch(B + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) });
  return j(r);
}
const api = (t, p, opt = {}) => fetch(B + '/api' + p, { method: opt.method || 'GET', headers: { 'content-type': 'application/json', 'x-token': t }, body: opt.body ? JSON.stringify(opt.body) : undefined }).then(j);

(async () => {
  const a = await reg('Greet' + Date.now() % 1e4);
  const pair = await api(a.token, '/pair/create', { method: 'POST' });

  // activity + suit stats (pair belum sealed — harus tetap aman)
  console.log('activity:', JSON.stringify(await api(a.token, '/activity')));
  console.log('suit:', JSON.stringify(await api(a.token, '/suit/stats')));

  // greeting — panggil Gemini (bisa 5-10s)
  const t0 = Date.now();
  const g = await api(a.token, '/ai/greeting', { method: 'POST' });
  console.log(`GREETING (${Date.now() - t0}ms):`, g.greeting);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
