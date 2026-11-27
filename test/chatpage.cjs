const puppeteer = require('puppeteer');
const fs = require('fs');
const B = 'http://localhost:3000';
const J = r => r.json();
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(J);
(async () => {
  const dir = 'test/tmp/chatpg' + Date.now(); fs.mkdirSync(dir, { recursive: true });
  const ua = await post('/api/register', { name: 'Sky' + Date.now() % 999 });
  const ub = await post('/api/register', { name: 'Tia' + Date.now() % 999 });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  await post('/api/msg', { text: 'halo sayang 💕' }, ua.token);
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.evaluateOnNewDocument(t => { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; }, ua.token);
  // MOBILE
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto(B, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1800));
  // open chat page
  await p.evaluate(() => document.getElementById('chatAll')?.click());
  await new Promise(r => setTimeout(r, 700));
  const pg = await p.evaluate(() => { const e = document.querySelector('.chatpg'); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }; });
  console.log('chat page rect vs viewport:', JSON.stringify(pg));
  await p.screenshot({ path: dir + '/chat-mobile.png' });
  // delete own chat message via ✕
  const del = await p.evaluate(() => { const x = document.querySelector('.cmdel'); if (x) { x.click(); return true; } return false; });
  await new Promise(r => setTimeout(r, 600));
  const left = await p.evaluate(() => document.querySelectorAll('.cmsg').length);
  console.log('chat delete clicked:', del, '| msgs left:', left);
  await p.evaluate(() => document.querySelector('.cpback')?.click());
  await new Promise(r => setTimeout(r, 400));
  // DESKTOP — sidebar
  await p.setViewport({ width: 1280, height: 800 });
  await new Promise(r => setTimeout(r, 900));
  const nav = await p.evaluate(() => { const n = document.querySelector('nav'); const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), dir: cs.flexDirection }; });
  console.log('desktop nav:', JSON.stringify(nav));
  await p.screenshot({ path: dir + '/desktop.png' });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
