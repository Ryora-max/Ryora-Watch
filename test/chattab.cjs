const puppeteer = require('puppeteer');
const fs = require('fs');
const B = 'http://localhost:3000';
const J = r => r.json();
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(J);
(async () => {
  const dir = 'test/tmp/chattab' + Date.now(); fs.mkdirSync(dir, { recursive: true });
  const ua = await post('/api/register', { name: 'Sky' + Date.now() % 999 });
  const ub = await post('/api/register', { name: 'Tia' + Date.now() % 999 });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  await post('/api/msg', { text: 'halo sayang 💕' }, ua.token);
  await post('/api/msg', { text: 'hai juga 😘' }, ub.token);
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.evaluateOnNewDocument(t => { try { localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1'; } catch (e) {} }, ua.token);
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p.goto(B, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1800));
  // 1. Home preview: no input, has "Buka chat"
  const home = await p.evaluate(() => ({ inp: !!document.getElementById('chatIn'), btn: !!document.getElementById('chatAll'), nav: getComputedStyle(document.querySelector('nav')).display }));
  console.log('home: chatIn?', home.inp, '| bukaChat?', home.btn, '| nav display:', home.nav);
  await p.screenshot({ path: dir + '/home.png' });
  // 2. Hamburger drawer
  await p.evaluate(() => document.getElementById('burger').click());
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: dir + '/drawer.png' });
  // 3. Drawer → Chat tab
  await p.evaluate(() => document.querySelector('.dw-item[data-t="chat"]').click());
  await new Promise(r => setTimeout(r, 800));
  const chat = await p.evaluate(() => ({
    pg: !!document.querySelector('.chatpg'),
    msgs: document.querySelectorAll('.cmsg').length,
    inp: !!document.getElementById('cmIn'),
    rect: document.querySelector('.chatpg')?.getBoundingClientRect().width,
  }));
  console.log('chat tab:', JSON.stringify(chat));
  await p.screenshot({ path: dir + '/chat-tab.png' });
  // 4. send message in tab
  await p.type('#cmIn', 'tes dari tab 💬');
  await p.evaluate(() => document.getElementById('cmSend').click());
  await new Promise(r => setTimeout(r, 600));
  const after = await p.evaluate(() => document.querySelectorAll('.cmsg').length);
  console.log('msgs after send:', after);
  await p.screenshot({ path: dir + '/chat-sent.png' });
  console.log('errors:', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
