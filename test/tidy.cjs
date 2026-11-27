const puppeteer = require('puppeteer');
const fs = require('fs');
const B = 'http://localhost:3000';
const J = r => r.json();
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(J);
(async () => {
  const dir = 'test/tmp/tidy' + Date.now(); fs.mkdirSync(dir, { recursive: true });
  const ua = await post('/api/register', { name: 'Sky' + Date.now() % 999 });
  const ub = await post('/api/register', { name: 'Tia' + Date.now() % 999 });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  await post('/api/msg', { text: 'halo 💕' }, ua.token);
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', r => errs.push('net: ' + r.url().slice(-60)));
  await p.evaluateOnNewDocument(t => { try { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; } catch (e) {} }, ua.token);
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto(B, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  const tabs = ['home', 'chat', 'map', 'sched', 'uang', 'miss', 'ai', 'kita'];
  for (const t of tabs) {
    await p.evaluate(t => goTab(t), t);
    await new Promise(r => setTimeout(r, 900));
    await p.screenshot({ path: `${dir}/m-${t}.png` });
    const ov = await p.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#view *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width > innerWidth + 2) bad.push(e.className || e.tagName); });
      return bad.slice(0, 4);
    });
    if (ov.length) console.log(`⚠️ ${t} overflow:`, ov.join(', '));
  }
  // scroll each tab to bottom to check cutoffs
  for (const t of ['home', 'sched', 'uang', 'miss', 'kita']) {
    await p.evaluate(t => goTab(t), t);
    await new Promise(r => setTimeout(r, 700));
    await p.evaluate(() => { const l = document.querySelector('#view .list') || document.getElementById('view'); l?.scrollTo?.(0, 99999); });
    await new Promise(r => setTimeout(r, 400));
    await p.screenshot({ path: `${dir}/m-${t}-bot.png` });
  }
  // burger drawer on mobile
  await p.evaluate(() => goTab('home'));
  await p.evaluate(() => document.getElementById('burger')?.click());
  await new Promise(r => setTimeout(r, 600));
  // desktop spot-check
  await p.setViewport({ width: 1280, height: 800 });
  await new Promise(r => setTimeout(r, 800));
  await p.evaluate(() => goTab('chat'));
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: dir + '/d-chat.png' });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
