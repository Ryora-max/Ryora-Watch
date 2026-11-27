const puppeteer = require('puppeteer');
const fs = require('fs');
const B = 'http://localhost:3000';
const J = r => r.json();
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(J);
const get = (p, t) => fetch(B + p, { headers: { 'x-token': t } }).then(J);
(async () => {
  const dir = 'test/tmp/final' + Date.now(); fs.mkdirSync(dir, { recursive: true });
  // ---- API sweep ----
  const ua = await post('/api/register', { name: 'Audit' + Date.now() % 999 });
  const ub = await post('/api/register', { name: 'Pair' + Date.now() % 999 });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const T = ua.token;
  // seed data
  await post('/api/msg', { text: 'halo' }, T);
  await post('/api/habit', { name: 'minum air' }, T);
  await post('/api/bucket', { text: 'nonton aurora' }, T);
  await post('/api/schedules', { title: 'call', time: Date.now() + 3600000, repeat: '' }, T);
  await post('/api/expense', { kind: 'in', pot: 'sav', amount: 50000, note: 'gajian' }, T);
  await post('/api/pin', { name: 'spot', lat: -6.2, lng: 106.8 }, T);
  const apis = ['/me', '/home', '/msgs', '/schedules', '/habits', '/bucket', '/expenses', '/pins', '/memories', '/voices', '/letters', '/capsules', '/gallery', '/garden', '/league', '/quiz', '/activity', '/ai/history', '/partner/location', '/miss/stats', '/scores/week', '/mood/week', '/wrapped'];
  const badApi = [];
  for (const a of apis) {
    try {
      const r = await fetch(B + '/api' + a, { headers: { 'x-token': T } });
      const t = await r.text();
      if (r.status !== 200) badApi.push(`${a} → ${r.status}`);
      else if (t === 'null' || t === 'undefined') badApi.push(`${a} → body ${t}`);
    } catch (e) { badApi.push(`${a} → ${e.message}`); }
  }
  console.log('API check:', badApi.length ? badApi : 'semua 200 OK');
  // ---- UI sweep ----
  const b = await puppeteer.launch({ headless: 'new', userDataDir: dir + '/prof' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', r => { if (!r.url().includes('nominatim')) errs.push('net: ' + r.url().slice(-70) + ' ' + r.failure()?.errorText); });
  p.on('response', r => { if (r.status() >= 400 && !r.url().includes('nominatim')) errs.push(`http${r.status()}: ${r.url().slice(-60)}`); });
  await p.evaluateOnNewDocument(t => { try { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; } catch (e) {} }, T);
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.goto(B, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));
  const UGLY = /undefined|NaN\b|\[object|null</gi;
  for (const t of ['home', 'chat', 'map', 'sched', 'uang', 'miss', 'ai', 'kita']) {
    await p.evaluate(t => goTab(t), t);
    await new Promise(r => setTimeout(r, 1400));
    const found = await p.evaluate(() => {
      const hits = [];
      const walker = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT);
      let n; while (n = walker.nextNode()) {
        const s = n.nodeValue;
        if (/undefined|\bNaN\b|\[object|>null</.test(s) && s.trim()) hits.push(s.trim().slice(0, 60));
      }
      return hits.slice(0, 5);
    });
    if (found.length) console.log(`⚠️ ${t} ugly text:`, found);
    await p.screenshot({ path: `${dir}/${t}.png` });
  }
  // drawer + settings
  await p.evaluate(() => document.getElementById('burger')?.click());
  await new Promise(r => setTimeout(r, 500));
  await p.evaluate(() => document.getElementById('gear')?.click());
  await new Promise(r => setTimeout(r, 700));
  const settingsUgly = await p.evaluate(() => {
    const el = document.querySelector('.settings');
    return el ? (el.textContent.match(/undefined|\bNaN\b|\[object/) ? 'ADA' : 'bersih') : 'settings gak kebuka';
  });
  console.log('settings:', settingsUgly);
  await p.screenshot({ path: dir + '/settings.png' });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
