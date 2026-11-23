const puppeteer = require('puppeteer');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync('test/shots', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 120000 });
  const p = await (await b.createBrowserContext()).newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.setViewport({ width: 390, height: 844 });
  const t1 = await (await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'T1' + Date.now() % 9999 }) })).json();
  const t2 = await (await fetch('http://localhost:3000/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'T2' + Date.now() % 9999 }) })).json();
  const code = (await (await fetch('http://localhost:3000/api/pair/create', { method: 'POST', headers: { 'x-token': t1.token } })).json()).code;
  await fetch('http://localhost:3000/api/pair/join', { method: 'POST', headers: { 'x-token': t2.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  await fetch('http://localhost:3000/api/voice', { method: 'POST', headers: { 'x-token': t2.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ==', dur: 8 }) });
  await fetch('http://localhost:3000/api/x-miss', { method: 'POST', headers: { 'x-token': t2.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern: 3 }) });
  await p.evaluateOnNewDocument(t => { localStorage.cw_token = t; localStorage.cw_setup_done = '1'; }, t1.token);
  await p.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.home', { timeout: 15000 }); await sleep(800);
  // miss tab: voice list + record button
  await p.click('[data-t="miss"]'); await sleep(700);
  const missTxt = await p.evaluate(() => $('#view').innerText);
  console.log('miss has voice section:', missTxt.includes('Pesan suara'), '| voice item:', missTxt.includes('8s'));
  await p.screenshot({ path: 'test/shots/n2-miss.png' });
  // settings: theme picker + wrapped
  await p.click('#gear'); await sleep(400);
  await p.screenshot({ path: 'test/shots/n2-settings.png' });
  await p.click('.tswatch[data-t="lavender"]'); await sleep(400);
  await p.screenshot({ path: 'test/shots/n2-lavender.png' });
  await p.click('#wrapBtn'); await sleep(800);
  const wtxt = await p.evaluate(() => document.querySelector('.wcard')?.innerText || 'NONE');
  console.log('wrapped card:', wtxt.replace(/\n/g, ' | ').slice(0, 140));
  await p.screenshot({ path: 'test/shots/n2-wrapped.png' });
  // switch theme sakura + home
  await p.click('#wclose'); await p.click('#gear'); await sleep(300);
  await p.click('.tswatch[data-t="sakura"]'); await sleep(300);
  await p.click('#cls'); await p.click('[data-t="home"]'); await sleep(500);
  await p.screenshot({ path: 'test/shots/n2-sakura.png' });
  console.log('DONE');
  await b.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
