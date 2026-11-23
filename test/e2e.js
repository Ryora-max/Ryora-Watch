// E2E self-test: 2 "HP" (browser context) → register → pair → cek semua fitur
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const errors = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function newCtx(browser, name) {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(BASE, ['geolocation', 'notifications', 'microphone']);
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 780 });
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    navigator.geolocation.watchPosition = (ok) => { ok({ coords: { latitude: -6.2 + Math.random() * 0.01, longitude: 106.81 } }); return 1; };
    navigator.getBattery = async () => ({ level: 0.85, onlevelchange: null });
    Notification = class { static permission = 'granted'; constructor() {} };
  });
  return { ctx, page };
}

const shot = (p, f) => p.screenshot({ path: `test/shots/${f}.png` }).catch(() => {});

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], userDataDir: `test/.chrome-${Date.now()}` });
try {
  console.log('== A: register ==');
  const A = await newCtx(b, 'A');
  await A.page.goto(BASE, { waitUntil: 'networkidle2' });
  await A.page.type('#name', 'Andi');
  await A.page.click('#go');
  await A.page.waitForSelector('#create', { timeout: 8000 });

  console.log('== A: buat kode ==');
  await A.page.click('#create');
  await A.page.waitForSelector('.code', { timeout: 8000 });
  const code = await A.page.$eval('.code', e => e.textContent);
  console.log('   kode:', code);
  await shot(A.page, '01-pair-A');

  console.log('== B: register + join ==');
  const B = await newCtx(b, 'B');
  await B.page.goto(BASE, { waitUntil: 'networkidle2' });
  await B.page.type('#name', 'Bella');
  await B.page.click('#go');
  await B.page.waitForSelector('#code', { timeout: 8000 });
  await B.page.type('#code', code);
  await B.page.click('#join'); await sleep(1200);
  await shot(B.page, '02-watch-B');

  console.log('== cek watchface B ==');
  await B.page.waitForSelector('.wscreen', { timeout: 5000 }).catch(() => errors.push('[B] watch sim tidak muncul'));
  const wtime = await B.page.$eval('#wtime', e => e.textContent).catch(() => null);
  console.log('   wtime:', wtime);
  const partnerName = await B.page.$eval('.who', e => e.textContent).catch(() => null);
  console.log('   header:', partnerName);
  await sleep(800); // tunggu status online broadcast
  console.log('   dot:', await B.page.$eval('#dot', e => e.textContent).catch(() => '?'));

  console.log('== A reload → harus langsung sealed ==');
  await A.page.reload({ waitUntil: 'networkidle2' }); await sleep(1200);
  const aWho = await A.page.$eval('.who', e => e.textContent).catch(() => null);
  console.log('   header A:', aWho);
  await shot(A.page, '03-watch-A');

  console.log('== B: swipe watch → layar peta ==');
  await B.page.evaluate(() => { const t = document.querySelector('#wtrack'); t.scrollTo({ left: t.clientWidth * 2 }); });
  await sleep(700);
  await shot(B.page, '04-watch-map');

  console.log('== B: swipe → AI & kangen ==');
  await B.page.evaluate(() => { const t = document.querySelector('#wtrack'); t.scrollTo({ left: t.clientWidth * 3 }); });
  await sleep(400); await shot(B.page, '05-watch-ai');
  await B.page.evaluate(() => { const t = document.querySelector('#wtrack'); t.scrollTo({ left: t.clientWidth * 4 }); });
  await sleep(400); await shot(B.page, '06-watch-kangen');

  console.log('== B → A: kirim kangen ==');
  await B.page.evaluate(() => socket.emit('miss:send', { pattern: 1 })); await sleep(1000);
  const missText = await A.page.$eval('#missText', e => e.textContent).catch(() => 'OVERLAY TIDAK MUNCUL');
  console.log('   A terima:', missText);
  await shot(A.page, '07-miss-received');

  console.log('== B: tab peta ==');
  await B.page.click('nav [data-t="map"]'); await sleep(1500);
  await shot(B.page, '08-map');
  const locbar = await B.page.$eval('#locbar', e => e.textContent).catch(() => 'locbar hilang');
  console.log('   locbar:', locbar);

  console.log('== B: tambah jadwal ==');
  await B.page.click('nav [data-t="sched"]'); await sleep(600);
  await B.page.type('#st', 'Makan siang bareng');
  const in2min = new Date(Date.now() + 120000);
  const pad = n => String(n).padStart(2, '0');
  await B.page.$eval('#stime', (el, v) => el.value = v, `${in2min.getFullYear()}-${pad(in2min.getMonth() + 1)}-${pad(in2min.getDate())}T${pad(in2min.getHours())}:${pad(in2min.getMinutes())}`);
  await B.page.click('#sadd'); await sleep(800);
  await shot(B.page, '09-sched');
  const schedCount = await B.page.$$eval('.item', e => e.length);
  console.log('   jadwal count B:', schedCount);
  await sleep(500);
  const schedCountA = await A.page.evaluate(() => fetch('/api/schedules', { headers: { 'x-token': localStorage.cw_token } }).then(r => r.json()).then(a => a.length));
  console.log('   jadwal count A (sinkron):', schedCountA);

  console.log('== B: AI chat (tanpa key → friendly) ==');
  await B.page.click('nav [data-t="ai"]'); await sleep(500);
  await B.page.type('#cin', 'halo'); await B.page.click('#csend'); await sleep(2000);
  const aiReply = await B.page.$eval('#msgs .msg.ai:last-child', e => e.textContent).catch(() => 'NO REPLY');
  console.log('   AI:', aiReply.slice(0, 80));

  console.log('\n===== HASIL =====');
  if (errors.length) { console.log('ERRORS:'); errors.forEach(e => console.log('  ✗', e)); }
  else console.log('  ✅ tidak ada console/page error');
} finally { await b.close(); }
