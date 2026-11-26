const puppeteer = require('puppeteer');
const B = 'http://localhost:3000';
const J = (r) => r.json();
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(J);
// tombol yang di-skip: destruktif / butuh hardware / eksternal
const SKIP = /unpair|del|logout|install|export|mic|vmode|geoTgl|pinBtn|photo|mem|voice|hfile|gfile|ttt|suit|tod|doodle|nobar|focus|touch|guess|letter|capsule|quiz|missBig|csend|locCenter|nav|rand|chatImg|chatFile|expIn|expOut|goalSet|brk|meet|tour|iosInstall|wrapBtn|wrapYr/i;
(async () => {
  const ua = await post('/api/register', { name: 'Sky' });
  const ub = await post('/api/register', { name: 'Tiara' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: require('os').tmpdir() + '/pc_' + Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 120)));
  await page.evaluateOnNewDocument((t) => {
    localStorage.cw_setup_done = '1'; localStorage.cw_token = t; localStorage.cw_toured = '1';
    window.prompt = () => 'test'; window.confirm = () => true; window.alert = () => {};
  }, ua.token);
  await page.goto(B, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  for (const t of ['home', 'map', 'sched', 'uang', 'miss', 'ai', 'kita']) {
    if (t !== 'home') await page.evaluate(tb => document.querySelector(`[data-t="${tb}"]`)?.click(), t);
    await new Promise(r => setTimeout(r, 1500));
    const clicked = await page.evaluate(async (skipRe) => {
      const re = new RegExp(skipRe, 'i');
      const out = [];
      for (const b of document.querySelectorAll('button:not([disabled])')) {
        const id = (b.id || '') + '|' + (b.className || '') + '|' + (b.textContent || '');
        if (re.test(id) || b.offsetParent === null) continue;
        try { b.click(); out.push(b.id || b.textContent.trim().slice(0, 20)); } catch (e) { out.push('THREW:' + b.id + ':' + e.message); }
        await new Promise(r => setTimeout(r, 60));
      }
      // tutup modal yang mungkin kebuka
      document.querySelectorAll('.wmodal,.settings,.lettercard').forEach(m => m.querySelector('button[class*=close],.iconbtn,button:last-child')?.click());
      return out;
    }, SKIP.source);
    console.log(`--- ${t}: klik ${clicked.length} tombol`);
    await new Promise(r => setTimeout(r, 400));
  }
  // settings modal
  await page.evaluate(() => document.querySelector('#gear')?.click());
  await new Promise(r => setTimeout(r, 800));
  const c2 = await page.evaluate(async () => {
    const out = [];
    for (const b of document.querySelectorAll('.settings button:not([disabled])')) {
      if (/unpair|avatar/i.test(b.id + '|' + b.className) || b.offsetParent === null) continue;
      try { b.click(); out.push(b.id || b.textContent.trim().slice(0, 20)); } catch (e) { out.push('THREW:' + e.message); }
      await new Promise(r => setTimeout(r, 60));
    }
    return out;
  });
  console.log(`--- settings: klik ${c2.length} tombol`);
  console.log('ERRORS:', errs.length ? errs.slice(0, 15) : 'none');
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
