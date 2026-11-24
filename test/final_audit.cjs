const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const J = (r) => r.json();
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(J);
(async () => {
  // buat pair dengan data real
  const ua = await post('/api/register', { name: 'Sky' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  await post('/api/profile', { avatar: '🐰', bday: '2004-01-15', pet_name: 'Ayang' }, ua.token);
  await post('/api/profile', { avatar: '🦊', bday: '2003-06-20' }, ub.token);
  await post('/api/pair/since', { ts: Date.now() - 400 * 86400000 }, ua.token);
  await post('/api/song', { text: 'Janji Setia - Tiara Andini' }, ua.token);
  await post('/api/meet', { ts: Date.now() + 12 * 86400000 }, ua.token);
  await post('/api/mood', { mood: '🥰' }, ua.token);
  await post('/api/mood', { mood: '😊' }, ub.token);
  await post('/api/status', { text: 'lagi kuliah 📚' }, ub.token);
  await post('/api/note', { text: 'jangan lupa makan ya sayang 💕' }, ub.token);
  await post('/api/daily/answer', { text: 'cara kamu selalu sabar sama aku' }, ua.token);
  await post('/api/daily/answer', { text: 'semangat kamu yang nggak pernah habis' }, ub.token);
  await post('/api/schedules', { title: '☕ Call yuk', start: Date.now() + 3 * 3600000, notify: true }, ua.token);
  await post('/api/schedules', { title: '🎬 Nobar weekend', start: Date.now() + 2 * 86400000, notify: true, repeat: 'weekly' }, ub.token);
  await post('/api/bucket', { text: 'nonton aurora bareng' }, ua.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/pp_' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  page.on('console', m => m.type() === 'error' && errs.push('CONSOLE ' + m.text().slice(0, 100)));
  await page.evaluateOnNewDocument((t) => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));
  const shots = [['home', 0], ['map', 2500], ['sched', 1200], ['miss', 1200], ['ai', 1200], ['kita', 1200]];
  for (const [t, wait] of shots) {
    if (t !== 'home') { await page.evaluate(tb => document.querySelector(`[data-t="${tb}"]`)?.click(), t); }
    await new Promise(r => setTimeout(r, wait || 1200));
    await page.screenshot({ path: `test/shot_${t}.png` });
    console.log('shot', t);
  }
  // settings modal
  await page.evaluate(() => document.querySelector('#setBtn')?.click() || document.querySelector('.iconbtn')?.click());
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'test/shot_settings.png' });
  console.log('shot settings');
  console.log('ERRORS:', errs.length ? errs.slice(0, 10) : 'none');
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
