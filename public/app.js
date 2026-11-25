const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const todayKey = () => new Date().toISOString().slice(0, 10);
const REACTS = ['❤️', '😂', '😭', '👍'];
const reactRow = (type, reacts = [], tid) => {
  const groups = {};
  reacts.forEach(r => { (groups[r.emoji] = groups[r.emoji] || { n: 0, mine: false }).n++; if (r.mine) groups[r.emoji].mine = true; });
  return `<div class="hreact" data-t="${type}"${tid ? ` data-tid="${tid}"` : ''}>` + REACTS.map(e => `<button data-e="${e}" class="${groups[e]?.mine ? 'on' : ''}">${e}${groups[e]?.n ? `<i>${groups[e].n}</i>` : ''}</button>`).join('') + '</div>';
};
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('cw_token');
let me = null, socket = null, map = null, markers = {}, trailLine = null, linkLine = null, midMark = null;
let currentTab = 'home', remindTimer = null, tapCount = 0, tapTimer = null;
let partnerLoc = null, myLoc = null, lastSync = null, schedCache = [], reminded = new Set(JSON.parse(localStorage.cw_reminded || '[]'));
let partnerOnline = false, partnerSeen = null, deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });

function toast(t, ms = 2600) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), ms);
}

const api = async (path, opts = {}) => {
  const r = await fetch('/api' + path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-token': token, ...opts.headers }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { localStorage.removeItem('cw_token'); location.reload(); }
  return r.json();
};
const agoText = (ts) => { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'baru saja'; if (m < 60) return m + ' mnt lalu'; if (m < 1440) return Math.round(m / 60) + ' jam lalu'; return Math.round(m / 1440) + ' hari lalu'; };
const distM = () => {
  if (!myLoc || !partnerLoc || typeof L === 'undefined') return null;
  return L.latLng(myLoc.lat, myLoc.lng).distanceTo([partnerLoc.lat, partnerLoc.lng]);
};
const distText = () => {
  const m = distM();
  if (m == null) return '';
  const km = m / 1000;
  return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
};
const together = () => { const m = distM(); return m != null && m < 150; };
const SICON = [['makan', '🍜'], ['kuliner', '🍜'], ['jajan', '🍜'], ['date', '💑'], ['jalan', '💑'], ['nonton', '🎬'], ['film', '🎬'], ['drakor', '📺'], ['belajar', '📚'], ['tugas', '📚'], ['kuliah', '📚'], ['sekolah', '📚'], ['ujian', '📝'], ['kerja', '💼'], ['rapat', '💼'], ['gym', '🏋️'], ['olahraga', '🏃'], ['lari', '🏃'], ['dokter', '💊'], ['sakit', '💊'], ['tidur', '😴'], ['belanja', '🛒'], ['game', '🎮'], ['main', '🎮'], ['gereja', '⛪'], ['ibadah', '🙏'], ['ketemu', '📍'], ['ultah', '🎂'], ['ulang tahun', '🎂'], ['libur', '🏖️'], ['travel', '✈️']];
const sicon = (t) => { const l = (t || '').toLowerCase(); return (SICON.find(([k]) => l.includes(k)) || [0, '📌'])[1]; };
const updateSeen = () => {
  const el = $('#seen');
  if (el) el.textContent = partnerOnline ? 'online' : partnerSeen ? 'aktif ' + agoText(partnerSeen) : 'offline';
};
let wasTogether = null;
const updateTogether = () => {
  const t = together();
  const el = $('#together');
  if (el) el.style.display = t ? '' : 'none';
  // "dia sampai" — selebrasi pas transisi jadi bareng (bukan saat app baru load)
  if (wasTogether === false && t) {
    heartRain(40); ding(); navigator.vibrate?.([200, 100, 200, 100, 400]);
    toast(`💚 ${pname()} udah deket — kalian bareng sekarang!`, 6000);
  }
  wasTogether = t;
};
const mkIcon = (c, letter = '') => L.divIcon({ html: `<div style="width:20px;height:20px;background:${c};border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px ${c};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:sans-serif">${letter}</div>`, iconSize: [20, 20], iconAnchor: [10, 10], className: '' });

// ---------- AUTH ----------
function authScreen() {
  const urlCode = new URLSearchParams(location.search).get('join');
  app.innerHTML = `<div class="screen"><div class="logo">🌊</div><h1>Ryora Watch</h1>
  <div class="card"><input id="name" placeholder="Nama kamu" maxlength="30"><button id="go">Masuk</button>
  <button class="ghost" id="rstBtn" style="margin-top:10px">🔑 Masuk dengan kode cadangan</button>
  <div id="rstBox" style="display:none;margin-top:10px"><input id="rstIn" placeholder="Tempel kode cadanganmu"><button id="rstGo" class="mini">Pulihkan akun</button></div>
  ${urlCode ? `<p class="muted">Kode undangan <b>${esc(urlCode)}</b> akan dipakai otomatis</p>` : ''}</div></div>`;
  $('#rstBtn').onclick = () => { $('#rstBox').style.display = ''; $('#rstIn').focus(); };
  $('#rstGo').onclick = async () => {
    const code = $('#rstIn').value.trim(); if (!code) return;
    const r = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const d = await r.json();
    if (d.token) { token = d.token; localStorage.setItem('cw_token', token); toast('Akun dipulihkan! 🔑'); boot(); }
    else toast(d.error || 'Kode salah');
  };
  const go = async () => {
    if (!$('#name').value.trim()) return toast('Isi namamu dulu ya');
    const r = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#name').value }) });
    const d = await r.json();
    if (d.token) {
      token = d.token; localStorage.setItem('cw_token', token);
      if (urlCode) {
        const j = await api('/pair/join', { method: 'POST', body: { code: urlCode } });
        if (!j.sealed) toast(j.error || 'Kode tidak valid');
      }
      history.replaceState({}, '', '/'); boot();
    } else toast(d.error || 'Gagal masuk');
  };
  $('#go').onclick = go;
  $('#name').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#name').focus();
}

let pairPoll = null;
function pairScreen(inviteCode) {
  clearInterval(pairPoll); pairPoll = null;
  if (inviteCode) {
    // Mode menunggu — auto-masuk begitu pasangan pakai kodenya
    app.innerHTML = `<div class="screen"><div class="logo">🌊</div><h1>Ryora Watch</h1>
    <div class="card"><p class="muted">Kode undanganmu — kirim ke pasanganmu:</p>
      <div class="code" id="codeText">${inviteCode}</div>
      <button class="ghost" id="share">📤 Bagikan link undangan</button>
      <div class="waitrow"><span class="wdots"><i></i><i></i><i></i></span> Menunggu pasanganmu masuk…</div>
      <button class="ghost" id="backPair">‹ Ganti cara lain</button></div></div>`;
    const link = location.origin + '/?join=' + inviteCode;
    $('#share').onclick = async () => {
      if (navigator.share) return navigator.share({ url: link }).catch(() => {});
      try { await navigator.clipboard.writeText(link); toast('Link disalin 📋'); }
      catch { prompt('Salin link ini:', link); }
    };
    $('#backPair').onclick = () => pairScreen();
    pairPoll = setInterval(async () => {
      const d = await api('/me');
      if (d?.pair?.status === 'sealed' && d?.partner) {
        clearInterval(pairPoll); me = d; toast('💞 Terhubung!'); boot();
      }
    }, 3000);
    return;
  }
  app.innerHTML = `<div class="screen"><div class="logo">🌊</div><h1>Ryora Watch</h1>
  <p class="muted">Hubungkan dengan pasanganmu</p>
  <div class="card"><button id="create">✨ Buat kode undangan</button>
  <div class="muted">— atau punya kode? —</div>
  <input id="code" placeholder="Kode pasangan (AAA-BBB)" style="text-transform:uppercase">
  <button class="ghost" id="join">Hubungkan</button></div></div>`;
  $('#create').onclick = async () => { const d = await api('/pair/create', { method: 'POST' }); if (d.code) pairScreen(d.code); else toast(d.error || 'gagal'); };
  const join = async () => {
    const code = $('#code').value.trim();
    if (!code) return toast('Isi kode dari pasanganmu');
    const d = await api('/pair/join', { method: 'POST', body: { code } });
    if (d.sealed) { toast('💞 Terhubung!'); boot(); } else toast(d.error || 'kode salah');
  };
  $('#join').onclick = join;
  $('#code').onkeydown = e => { if (e.key === 'Enter') join(); };
}

// ---------- MAIN ----------
async function boot() {
  clearInterval(pairPoll);
  me = await api('/me');
  if (!me || me.error) return authScreen();
  if (!me.pair || me.pair.status !== 'sealed' || !me.partner) return pairScreen(me.pair?.code);
  if (!me.user.ai_name && !localStorage.cw_setup_done) return setupScreen();
  mainUI();
}

// ---------- ONBOARDING: siapin bestie sebelum mulai ----------
function setupScreen() {
  let gender = 'cewe';
  app.innerHTML = `<div class="screen"><div class="logo">✦</div><h1>Siapin Bestie Kamu</h1>
  <div class="card"><p class="muted">Kamu dapat AI companion yang nemenin di app & jam. Kasih nama & pilih dia cowo atau cewe:</p>
    <input id="ainame" placeholder="Nama bestie (contoh: Bintang)" maxlength="20">
    <div class="moodrow" style="justify-content:center">
      <button class="mood on" data-g="cewe" style="width:auto;padding:0 16px">🙋‍♀️ Cewe</button>
      <button class="mood" data-g="cowo" style="width:auto;padding:0 16px">🙋‍♂️ Cowo</button>
    </div>
    <button id="start">Mulai 🌊</button>
    <button class="ghost" id="skip">Nanti aja</button></div></div>`;
  app.querySelectorAll('.mood').forEach(b => b.onclick = () => { gender = b.dataset.g; app.querySelectorAll('.mood').forEach(x => x.classList.toggle('on', x === b)); });
  $('#start').onclick = async () => {
    const name = $('#ainame').value.trim();
    if (!name) return toast('Kasih nama dulu ya');
    await api('/ai/prefs', { method: 'POST', body: { name, gender } });
    me.user.ai_name = name; me.user.ai_gender = gender;
    localStorage.cw_pitch = gender === 'cowo' ? VOICE_PITCH.cowo : VOICE_PITCH.cewe;
    mainUI();
  };
  $('#skip').onclick = () => { localStorage.cw_setup_done = '1'; mainUI(); };
  $('#ainame').focus();
}

async function mainUI() {
  app.innerHTML = `
  <header>
    <div class="who"><span class="avatar">${esc(av(me.partner))}</span>
      <div class="whoinfo"><div class="pname">${esc(pname())}${me.partner.mood ? ' ' + me.partner.mood : ''} <span id="dot">⚪</span><span id="pbatt"></span><span id="together" class="tbadge" style="display:none">💚 bareng</span></div>
      <div class="muted" id="missStat"><span id="daystat">💕 hari ke-${daysTogether()}</span> · <span id="seen">…</span> <span id="pstatus" class="stag">${esc(me.partner.status || '')}</span></div></div>
    </div>
    <div class="hdr-right"><span id="clock" class="clock"></span><button id="gear" class="iconbtn">⚙️</button></div>
  </header>
  <div id="view"></div>
  <nav>
    <button data-t="home" class="on">🏠<span>Home</span></button>
    <button data-t="map">🗺️<span>Peta</span></button>
    <button data-t="sched">📅<span>Jadwal</span></button>
    <button data-t="miss">💓<span>Kangen</span></button>
    <button data-t="ai">✦<span>AI</span></button>
    <button data-t="kita">✨<span>Kita</span></button>
  </nav>`;
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => { document.querySelectorAll('nav button').forEach(x => x.classList.remove('on')); b.classList.add('on'); show(b.dataset.t); });
  $('#gear').onclick = settings;
  partnerOnline = !!me.online; partnerSeen = me.partnerLastSeen;
  $('#dot').textContent = partnerOnline ? '🟢' : '⚪';
  if (me.partnerBattery != null) $('#pbatt').textContent = ` ${me.partnerBattery}%`;
  schedCache = await api('/schedules');
  api('/ai/history').then(h => { if (h?.length && !chatMsgs.length) chatMsgs = h.map(m => ({ role: m.role === 'model' ? 'ai' : 'me', text: m.text, ts: m.ts })); }).catch(() => {});
  // sapaan bestie sekali per hari
  if (localStorage.cw_greeted !== new Date().toDateString()) {
    localStorage.cw_greeted = new Date().toDateString();
    api('/ai/greeting', { method: 'POST' }).then(g => {
      if (g?.greeting) {
        chatMsgs.push({ role: 'ai', text: g.greeting, ts: Date.now() });
        toast(`✦ ${aiName()}: ${g.greeting.slice(0, 80)}`, 5000);
      }
    }).catch(() => {});
  }
  const clockEl = $('#clock'), tickClock = () => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); };
  tickClock(); setInterval(tickClock, 5000);
  connectSocket(); show('home'); refreshMissStat(); shareBattery(); startGeo(); updateSeen(); updateTogether();
  // bestie proaktif — check-in random tiap ~45-95 menit selama app kebuka
  const pingLoop = () => setTimeout(async () => {
    try {
      const hr = new Date().getHours();
      if (!document.hidden && hr >= 7 && hr < 22) { // quiet hours — jangan ganggu malam-malam
        const r = await api('/ai/ping', { method: 'POST' });
        if (r?.greeting) {
          toast(`✦ ${aiName()}: ${r.greeting}`, 8000);
          chatMsgs.push({ role: 'ai', text: r.greeting, ts: Date.now() });
          if (currentTab === 'ai') renderMsgs();
        }
      }
    } catch {}
    pingLoop();
  }, (45 + Math.random() * 50) * 60000);
  pingLoop();
  tour();
  // Web Push — subscribe kalau notif udah diizinin
  (async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
      const { key } = await api('/push/vapid'); if (!key) return;
      const reg = await navigator.serviceWorker.ready;
      const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      await api('/push/sub', { method: 'POST', body: { sub: sub.toJSON() } });
    } catch {}
  })();
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname))
    banner('⚠️ GPS butuh HTTPS — buka via localhost atau tunnel (cloudflared/ngrok)');
  clearInterval(remindTimer);
  remindTimer = setInterval(() => { checkReminders(); updateSeen(); }, 20000);
  checkReminders();
}

function banner(t) {
  const b = document.createElement('div'); b.className = 'banner'; b.textContent = t;
  app.prepend(b); setTimeout(() => b.remove(), 12000);
}

// ---------- SOCKET ----------
function connectSocket() {
  socket?.disconnect();
  socket = io({ auth: { token } });
  socket.on('connect', () => { if (myLoc) socket.emit('location:update', myLoc); });
  socket.on('disconnect', () => toast('Koneksi terputus, menyambung ulang…'));
  socket.on('partner:status', ({ online, lastSeen }) => { partnerOnline = !!online; if (!online) partnerSeen = lastSeen || Date.now(); $('#dot').textContent = online ? '🟢' : '⚪'; updateSeen(); });
  socket.on('partner:battery', ({ level }) => { $('#pbatt').textContent = ` ${level}%`; });
  socket.on('schedules:changed', async () => {
    schedCache = await api('/schedules');
    refreshMissStat();
    if (currentTab === 'sched') loadSchedules();

  });
  socket.on('location:update', (l) => { partnerLoc = l; lastSync = Date.now(); updatePartnerMarkers(l); trailLine?.addLatLng([l.lat, l.lng]); updateTogether(); });
  socket.on('miss:receive', ({ from, pattern }) => {
    if (isQuiet()) { toast(`💓 ${from} kangen kamu — lagi jam tenang 🔕`, 3000); refreshMissStat(); return; }
    navigator.vibrate?.(Array(pattern).fill([250, 120]).flat());
    ding();
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Ryora Watch', { body: `${from} kangen kamu 💓` }); } catch {}
    $('#missText').textContent = `${from} kangen kamu${pattern > 1 ? ` (kode ×${pattern})` : ''} 💓`;
    heartRain(Math.min(pattern * 6, 40));
    $('#missOverlay').classList.remove('hidden');
    setTimeout(() => $('#missOverlay').classList.add('hidden'), 3500);
    refreshMissStat();
  });
  socket.on('miss:sent', () => { navigator.vibrate?.(80); toast('💓 terkirim!'); refreshMissStat(); if (currentTab === 'miss') loadMissTab(); });
  socket.on('home:changed', async () => {
    try { const d = await api('/me'); if (d?.partner) { me.partner = d.partner; me.pair = d.pair; } } catch {}
    if (currentTab === 'home') renderHome($('#view'));
    const hn = $('.whoinfo .pname'); if (hn) hn.childNodes[0].textContent = pname() + (me.partner.mood ? ' ' + me.partner.mood : '') + ' ';
  });
  socket.on('bucket:changed', () => { if (currentTab === 'sched') loadBucket(); });
  socket.on('partner:statustext', ({ text, uid }) => {
    if (uid === me.user.id) return;
    me.partner.status = text;
    const el = $('#pstatus'); if (el) el.textContent = text;
    const el2 = $('#hstatus'); if (el2) el2.textContent = text;
  });
  socket.on('voice:new', ({ from, dur }) => {
    ding();
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Ryora Watch', { body: `🎤 ${from} kirim pesan suara (${dur}s)` }); } catch {}
    toast(`🎤 ${from} kirim pesan suara (${dur}s)`);
    loadVoices();
  });
  socket.on('care:receive', ({ from, kind }) => {
    if (isQuiet()) { toast(`💓 ${from} mikirin kamu — lagi jam tenang 🔕`, 3000); return; }
    navigator.vibrate?.([200, 100, 200]);
    ding();
    const label = { makan: '🍚 "Udah makan belum?"', minum: '💧 "Minum air ya!"', peluk: '🤗 peluk virtual', tidur: '😴 "Istirahat dulu ya"' }[kind] || kind;
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Ryora Watch', { body: `${from}: ${label}` }); } catch {}
    toast(`${from} — ${label}`, 4000);
  });
  // "lagi apa?" — dia minta foto live darimu
  socket.on('photo:ask', ({ from }) => {
    ding(); navigator.vibrate?.([200, 100, 200]);
    const mp = document.createElement('div'); mp.className = 'moodprompt card';
    mp.innerHTML = `<span>📸 ${esc(from)} mau lihat kamu lagi apa</span><button id="paGo" class="mini">📷 Kirim</button><button id="paNo" class="mini">✕</button>`;
    document.body.appendChild(mp);
    setTimeout(() => mp.remove(), 30000);
    mp.querySelector('#paNo').onclick = () => mp.remove();
    mp.querySelector('#paGo').onclick = () => {
      mp.remove();
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'user';
      inp.onchange = () => {
        const f = inp.files[0]; if (!f) return;
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 640 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const data = c.toDataURL('image/jpeg', .62);
          api('/photo', { method: 'POST', body: { img: data, caption: '⚡ lagi apa' } }).then(r => toast(r.ok ? 'Foto terkirim 📸' : 'gagal kirim'));
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(f);
      };
      inp.click();
    };
  });
  // fokus bareng — timer sinkron dua HP
  socket.on('focus:go', ({ from, at, dur }) => {
    const el = document.createElement('div'); el.className = 'nobarOv';
    el.innerHTML = `<div class="nobx"><b>📵 FOKUS BARENG</b><span class="nbn" id="focT"></span><i>mulai sama ${esc(from)} — hp diemin dulu ya</i><button class="mini ghost" id="focOut" style="width:auto;padding:8px 20px">keluar</button></div>`;
    document.body.appendChild(el);
    ding(); navigator.vibrate?.([300, 100, 300]);
    const t = el.querySelector('#focT');
    const end = at + dur;
    const tick = setInterval(() => {
      const now = Date.now();
      if (now < at) { t.textContent = Math.ceil((at - now) / 1000); return; }
      const left = Math.max(0, end - now);
      const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      t.textContent = `${m}:${String(s).padStart(2, '0')}`;
      if (left <= 0) { clearInterval(tick); ding(); t.textContent = '🎉'; el.querySelector('i').textContent = 'selesai! balik ngobrol yuk'; setTimeout(() => el.remove(), 8000); }
    }, 300);
    el.querySelector('#focOut').onclick = () => { clearInterval(tick); el.remove(); };
  });
  socket.on('touch:partner', ({ on }) => {
    const el = $('#touchState'); if (el) el.textContent = on ? `${pname()} juga nyentuh… 👀` : '';
  });
  socket.on('touch:match', () => {
    navigator.vibrate?.([400, 150, 400]);
    ding(); heartRain(30);
    const el = $('#touchState'); if (el) el.textContent = '💞 NYENTUH BARENG!';
    toast('💞 Kalian nyentuh bareng!');
  });
  socket.on('suit:invite', ({ from }) => {
    suitWaiting = true;
    ding();
    const el = $('#suitState'); if (el) el.textContent = `${from} udah milih — giliran kamu! 👀`;
    toast(`${from} ngajak adu suit! ✊✋✌️`);
    navigator.vibrate?.(150);
  });
  socket.on('suit:result', ({ winner, names, picks }) => {
    suitWaiting = false;
    const myHand = picks[me.user.id], theirHand = Object.entries(picks).find(([id]) => id !== me.user.id)?.[1];
    const msg = winner === 'draw' ? `Seri! ${myHand} vs ${theirHand} 🤝`
      : winner === me.user.id ? `KAMU MENANG! ${myHand} vs ${theirHand} 🎉`
      : `${names[winner]} menang — ${theirHand} vs ${myHand} 😭`;
    ding(); if (winner === me.user.id) { heartRain(15); navigator.vibrate?.([300, 100, 300]); } else navigator.vibrate?.(150);
    const el = $('#suitState'); if (el) el.textContent = msg;
    toast(msg, 4000);
    suitMyPick = null;
    $$('.suit').forEach(x => x.classList.remove('on'));
  });
  socket.on('letter:new', ({ from }) => {
    ding(); navigator.vibrate?.([250, 100, 250]);
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Ryora Watch', { body: `💌 ${from} nulis surat buat kamu` }); } catch {}
    toast(`💌 ${from} nulis surat buat kamu!`, 5000);
    loadLetters();
  });
  // XOXO — invite & state
  socket.on('ttt:invite', ({ from }) => {
    ding(); navigator.vibrate?.(150);
    const mp = document.createElement('div'); mp.className = 'moodprompt card';
    mp.innerHTML = `<span>⭕ ${esc(from)} ngajak main XOXO!</span><button id="ttA" class="mini">Gas!</button><button id="ttN" class="mini">✕</button>`;
    document.body.appendChild(mp);
    setTimeout(() => mp.remove(), 30000);
    mp.querySelector('#ttA').onclick = () => { socket.emit('ttt:accept'); mp.remove(); };
    mp.querySelector('#ttN').onclick = () => mp.remove();
  });
  socket.on('ttt:start', ({ x }) => {
    tttMark = x === me.user.id ? 'x' : 'o';
    if (currentTab !== 'miss') { document.querySelectorAll('nav button').forEach(b => b.classList.remove('on')); document.querySelector('[data-t="miss"]')?.classList.add('on'); show('miss'); }
    toast(`⭕ XOXO mulai — kamu ${tttMark === 'x' ? '❌ jalan duluan' : '⭕'}!`, 4000);
  });
  socket.on('ttt:state', (g) => { tttG = g; renderTtt(g); });
  // tebak doodle
  socket.on('guess:start', ({ from }) => {
    ding(); toast(`🧩 ${from} mulai gambar — tebak apa!`, 4000);
    if (currentTab !== 'miss') { document.querySelectorAll('nav button').forEach(b => b.classList.remove('on')); document.querySelector('[data-t="miss"]')?.classList.add('on'); show('miss'); }
    guessMode('guess');
  });
  socket.on('guess:stroke', (d) => {
    const cv = $('#guessCv'); if (!cv || guessRole !== 'guess') return;
    const cx = cv.getContext('2d');
    cx.strokeStyle = d.c; cx.lineWidth = 4; cx.lineCap = cx.lineJoin = 'round';
    cx.beginPath(); cx.moveTo(d.x0, d.y0); cx.lineTo(d.x1, d.y1); cx.stroke();
  });
  socket.on('guess:try', ({ from, text }) => { if (guessRole === 'draw') toast(`🧩 ${from} nebak: "${text}"`, 5000); });
  socket.on('guess:correct', ({ from }) => {
    heartRain(40); ding(); navigator.vibrate?.([300, 100, 300]);
    toast(`🎉 Tebakan bener! ${guessRole === 'draw' ? 'Dia jago nebak' : 'Kamu jago nebak'}!`, 5000);
    guessMode(null);
  });
  socket.on('guess:end', () => guessMode(null));
  socket.on('pins:changed', () => { if (map) loadPins(); });
  socket.on('nobar:go', ({ from, at }) => {
    const el = document.createElement('div'); el.className = 'nobarOv';
    el.innerHTML = `<div class="nobx"><b>🎬 NOBAR BARENG!</b><span class="nbn">3</span><i>ajakan ${esc(from)} — tekan PLAY pas hitungan habis!</i></div>`;
    document.body.appendChild(el);
    ding(); navigator.vibrate?.([200, 100, 200, 100, 500]);
    const n = el.querySelector('.nbn');
    const tick = setInterval(() => {
      const left = Math.ceil((at - Date.now()) / 1000);
      if (left <= 0) { n.textContent = '▶️ PLAY!'; ding(); clearInterval(tick); setTimeout(() => el.remove(), 6000); }
      else n.textContent = left;
    }, 200);
    el.onclick = () => { clearInterval(tick); el.remove(); };
  });
  socket.on('tod:card', ({ mode, text, from }) => {
    ding(); navigator.vibrate?.(200);
    const el = $('#todState');
    if (el) {
      el.style.display = '';
      el.innerHTML = `<b>${mode === 'dare' ? '😈 DARE' : '😇 TRUTH'}</b><span>${esc(text)}</span><i>dari ${esc(from)}</i>`;
    }
    toast(`${mode === 'dare' ? '😈 Dare' : '😇 Truth'} dari ${from}!`, 4000);
  });
  socket.on('partner:mood', ({ mood, uid }) => {
    if (uid === me.user.id) return;
    me.partner.mood = mood;
    const pn = $('.pname');
    if (pn) pn.innerHTML = `${esc(pname())}${mood ? ' ' + mood : ''} <span id="dot">${$('#dot')?.textContent || '⚪'}</span><span id="pbatt">${$('#pbatt')?.textContent || ''}</span><span id="together" class="tbadge" style="display:${together() ? '' : 'none'}">💚 bareng</span>`;

    toast(`${pname()} lagi ${mood}`);
    // mood sedih/lelah → tawaran peluk satu tap
    if (['🥺', '😤', '🤒'].includes(mood)) {
      const mp = document.createElement('div'); mp.className = 'moodprompt card';
      mp.innerHTML = `<span>${esc(pname())} lagi ${mood}</span><button id="mpHug" class="mini">🤗 Peluk dia</button><button id="mpNo" class="mini">✕</button>`;
      document.body.appendChild(mp);
      setTimeout(() => mp.remove(), 25000);
      mp.querySelector('#mpHug').onclick = () => { socket.emit('care:send', { kind: 'peluk' }); toast(`Peluk terkirim ke ${pname()} 🤗`); mp.remove(); };
      mp.querySelector('#mpNo').onclick = () => mp.remove();
    }
  });
}

let suitMyPick = null, suitWaiting = false;
let actx = null;
function ding() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
      o.connect(g).connect(actx.destination);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.55);
    });
  } catch {}
}

function heartRain(n) {
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div');
    h.className = 'heartfall'; h.textContent = '❤';
    h.style.left = Math.random() * 100 + 'vw';
    h.style.animationDelay = Math.random() * 1.2 + 's';
    h.style.fontSize = 14 + Math.random() * 26 + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 4500);
  }
}

const nextSchedText = () => {
  const n = schedCache.find(s => s.start_time > Date.now() - 60000);
  if (!n) return null;
  const t = new Date(n.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `⏰ ${t} ${n.title.slice(0, 14)}`;
};
async function refreshMissStat() {
  const s = await api('/miss/stats');
  const el = $('#daystat');
  if (!el) return;
  const nxt = nextSchedText();
  el.textContent = `💕 hari ke-${daysTogether()}${nxt ? ' · ' + nxt : ''}`;
}

// ---------- KANGEN ----------
function missTap() {
  if (!socket?.connected) { toast('Belum terhubung ke server'); return; }
  tapCount = Math.min(tapCount + 1, 5);
  const tn = $('#tapN'); if (tn) tn.textContent = '×' + tapCount;
  navigator.vibrate?.(40);
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { socket.emit('miss:send', { pattern: tapCount }); tapCount = 0; const t2 = $('#tapN'); if (t2) t2.textContent = ''; loadMissTab(); }, 1200);
}

async function loadMissTab() {
  const [s, hist, suit] = await Promise.all([api('/miss/stats'), api('/miss/history'), api('/suit/stats')]);
  const sc = $('#suitScore');
  if (sc && suit) sc.textContent = (suit.me || suit.them || suit.draw) ? `skor: kamu ${suit.me} · ${pname()} ${suit.them}${suit.draw ? ' · seri ' + suit.draw : ''}` : '';
  const st = $('#missStats');
  if (st) st.innerHTML = `<div class="mstat"><b>${s.sent || 0}</b><span>kamu kirim</span></div>
    <div class="mstat"><b>${s.received || 0}</b><span>dia kirim</span></div>
    <div class="mstat"><b>${(s.sent || 0) + (s.received || 0)}</b><span>minggu ini</span></div>`;
  const hh = $('#missHist');
  if (hh) hh.innerHTML = hist.length ? hist.slice(0, 30).map(e => {
    const isMe = e.from_user === me.user.id;
    return `<div class="histrow"><span class="hwho">${isMe ? 'Kamu' : esc(e.from_name || '?')}</span><span class="hpat">${'💓'.repeat(e.pattern)}</span><span class="hwhen">${agoText(e.ts)}</span></div>`;
  }).join('') : '<p class="muted">Belum ada riwayat — kirim 💓 pertama ke pasanganmu.</p>';
}

// ---------- GEO + BATTERY ----------
let geoState = 'off'; // off | on | denied | unsupported | paused
let geoOff = localStorage.cw_geo_off === '1', geoWatch = null;
function toggleGeo() {
  geoOff = !geoOff;
  if (geoOff) {
    localStorage.cw_geo_off = '1';
    if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch);
    geoWatch = null; geoState = 'paused';
    toast('📍 Share lokasi dimatikan — hemat baterai');
  } else {
    delete localStorage.cw_geo_off;
    geoState = 'off'; startGeo();
    toast('📍 Share lokasi aktif lagi');
  }
  renderGeoCard();
}
function startGeo() {
  if (geoOff) { geoState = 'paused'; renderGeoCard(); return; }
  if (!navigator.geolocation) { geoState = 'unsupported'; return; }
  navigator.permissions?.query({ name: 'geolocation' }).then(p => {
    if (p.state === 'denied') geoState = 'denied';
    p.onchange = () => { if (p.state === 'denied') { geoState = 'denied'; renderGeoCard(); } };
  }).catch(() => {});
  geoWatch = navigator.geolocation.watchPosition(p => {
    geoState = 'on'; renderGeoCard();
    myLoc = { lat: p.coords.latitude, lng: p.coords.longitude };
    socket?.emit('location:update', myLoc);
    if (map) {
      if (!markers.me) { markers.me = L.marker([myLoc.lat, myLoc.lng], { icon: mkIcon('#4fd8c0', me.user.name[0].toUpperCase()) }).addTo(map); map.setView([myLoc.lat, myLoc.lng], 15); }
      else markers.me.setLatLng([myLoc.lat, myLoc.lng]);
    }
    fitBoth(); updateTogether();
  }, e => { if (e.code === 1) { geoState = 'denied'; renderGeoCard(); } }, { enableHighAccuracy: true, maximumAge: 30000 });
}

function askGeo() {
  navigator.geolocation?.getCurrentPosition(() => { geoState = 'on'; renderGeoCard(); },
    e => { if (e.code === 1) { geoState = 'denied'; renderGeoCard(); toast('Izin masih ditolak — aktifkan di pengaturan browser'); } },
    { enableHighAccuracy: true });
}

function renderGeoCard() {
  const c = $('#geoCard'); if (!c) return;
  if (geoState === 'on') { c.style.display = 'none'; return; }
  c.style.display = '';
  c.innerHTML = geoState === 'denied'
    ? `📍 <b>Lokasi ditolak</b><span>Aktifkan di ikon 🔒 di address bar browser</span>`
    : geoState === 'paused'
    ? `📍 <b>Share lokasi mati</b><span>Dia nggak lihat posisimu sekarang</span><button id="geoGo" class="mini">Nyalakan lagi</button>`
    : `📍 <b>Lokasi belum aktif</b><span>Biar ${esc(pname())} bisa lihat posisimu live</span><button id="geoGo" class="mini">Aktifkan lokasi</button>`;
  const g = $('#geoGo'); if (g) g.onclick = askGeo;
}

async function shareBattery() {
  try { const b = await navigator.getBattery(); const send = () => socket?.emit('battery:update', { level: Math.round(b.level * 100) }); send(); b.onlevelchange = send; } catch {}
}

function updatePartnerMarkers(l) {
  if (map) {
    if (!markers.p) markers.p = L.marker([l.lat, l.lng], { icon: mkIcon('#5cc8ff', av(me.partner)) }).addTo(map);
    else markers.p.setLatLng([l.lat, l.lng]);
  }
  fitBoth();
  const lb = $('#locpanel');
  if (lb) lb.innerHTML = `<span class="avatar">${esc(av(me.partner))}</span>
    <div class="locinfo"><b>${esc(pname())}</b><span>${distText() ? distText() + ' · ' : ''}${agoText(l.ts)}</span></div>
    <button id="locCenter" class="iconbtn">◎</button>`;
  const lc = $('#locCenter');
  if (lc) lc.onclick = () => map?.fitBounds(L.latLngBounds(markers.me?.getLatLng() || [l.lat, l.lng], markers.p?.getLatLng() || [l.lat, l.lng]).pad(0.3));
}

function fitBoth() {
  if (!map || !markers.me || !markers.p) return;
  map.fitBounds(L.latLngBounds(markers.me.getLatLng(), markers.p.getLatLng()).pad(0.3));
  linkLine?.remove(); midMark?.remove();
  const a = markers.me.getLatLng(), b = markers.p.getLatLng();
  linkLine = L.polyline([a, b], { color: '#ff7fb0', weight: 3, opacity: .9, dashArray: '1 12', lineCap: 'round', className: 'loveline' }).addTo(map);
  midMark = L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { icon: L.divIcon({ html: '<div class="lovefloat">💕</div>', iconSize: [22, 22], iconAnchor: [11, 11], className: '' }), interactive: false }).addTo(map);
}

// ---------- TABS ----------
function show(tab) {
  currentTab = tab;
  try { map?.remove(); } catch {}
  map = null; delete markers.me; delete markers.p; trailLine = null; linkLine = null; midMark = null;
  const v = $('#view');
  if (tab === 'home') return renderHome(v);
  if (tab === 'map') {
    v.innerHTML = `<div id="map"></div><div class="geocard" id="geoCard" style="display:none"></div><button id="geoTgl" class="geotgl ${geoOff ? 'off' : ''}" title="Share lokasi">${geoOff ? '📍⊘' : '📍'}</button><button id="pinBtn" class="geotgl" style="right:62px" title="Pin tempat favorit di sini">📌</button><div class="locpanel" id="locpanel"><span class="avatar">${esc(av(me.partner))}</span><div class="locinfo"><b>${esc(pname())}</b><span>menunggu lokasi…</span></div></div><div class="pinchips" id="pinChips"></div>`;
    $('#geoTgl').onclick = () => { toggleGeo(); show('map'); };
    $('#pinBtn').onclick = async () => {
      if (!myLoc) return toast('Lokasimu belum ada — nyalakan GPS dulu');
      const name = prompt('Nama tempat ini? (misal: first date kita 💕)');
      if (!name?.trim()) return;
      const r = await api('/pin', { method: 'POST', body: { name: name.trim(), lat: myLoc.lat, lng: myLoc.lng } });
      toast(r.ok ? `📌 "${name.trim()}" disimpan di peta kalian!` : 'gagal simpan');
      loadPins();
    };
    initMap(); renderGeoCard(); return;
  }
  if (tab === 'miss') {
    v.innerHTML = `<div class="misspage">
      <button id="missBig"><span class="hb">💓</span><span id="tapN"></span></button>
      <div class="muted">tap berkali-kali buat sinyal lebih kuat</div>
      <div class="missstats" id="missStats"></div>
      <div class="msect">
        <button id="touchBtn" class="touchbtn">🤲 Tahan di sini — sentuh bareng</button>
        <div class="muted" id="touchState" style="margin-top:8px;min-height:18px"></div>
      </div>
      <div class="msect"><b>Peduli dia</b>
        <div class="caregrid">
          <button class="care" data-k="makan">🍚<span>Udah makan?</span></button>
          <button class="care" data-k="minum">💧<span>Minum air!</span></button>
          <button class="care" data-k="peluk">🤗<span>Peluk virtual</span></button>
          <button class="care" data-k="tidur">😴<span>Istirahat ya</span></button>
        </div>
      </div>
      <div class="msect"><b>Main bareng</b>
        <div class="playgrid">
          <div class="playbox"><div class="pbt">✊ Suit</div>
            <div class="suitrow"><button class="suit" data-h="✊">✊</button><button class="suit" data-h="✋">✋</button><button class="suit" data-h="✌️">✌️</button></div>
            <div class="muted" id="suitState" style="min-height:16px;font-size:11px"></div>
            <div class="muted" id="suitScore" style="font-size:10px"></div>
          </div>
          <div class="playbox"><div class="pbt">🎲 Truth / Dare</div>
            <div class="todrow"><button class="tod" data-m="truth">😇</button><button class="tod" data-m="dare">😈</button></div>
            <div id="todState" class="todcard" style="display:none"></div>
          </div>
        </div>
        <div class="playbox" style="margin-top:8px">
          <div class="pbt">⭕ XOXO</div>
          <div id="tttState" class="hsub" style="min-height:16px;text-align:center"></div>
          <div id="tttBoard" class="tttboard" style="display:none"></div>
          <button id="tttBtn" class="mini ghost" style="width:100%">Ajak main</button>
        </div>
        <div class="playbox" style="margin-top:8px">
          <div class="pbt">🧩 Tebak doodle</div>
          <div id="guessState" class="hsub" style="min-height:16px;text-align:center">gambar sesuatu — dia nebak!</div>
          <div id="guessWrap" style="display:none">
            <canvas id="guessCv" width="260" height="200"></canvas>
            <div class="hqin" id="guessInRow" style="display:none"><input id="guessIn" placeholder="Tebakannya…" maxlength="40"><button id="guessGo" class="mini">Tebak</button></div>
            <button id="guessWin" class="mini" style="width:100%;display:none">✅ Tebakan bener!</button>
          </div>
          <button id="guessBtn" class="mini ghost" style="width:100%">✏️ Mulai menggambar</button>
        </div>
        <button id="quizBtn" class="sbtn" style="--c:#ffd166;width:100%;margin-top:8px">💘<span>Quiz "seberapa kenal"</span></button>
        <div id="wkScore" class="hsub" style="text-align:center;min-height:14px"></div>
        <button id="nobar" class="sbtn" style="--c:#ff7fb0;width:100%;margin-top:8px">🎬<span>Nobar bareng — play serentak</span></button>
        <button id="focusBtn" class="sbtn" style="--c:#7ee8a2;width:100%;margin-top:8px">⏱️<span>Fokus bareng — timer 25 mnt sinkron</span></button>
      </div>
      <div class="msect"><b>Kirim sesuatu</b>
        <div class="sendgrid">
          <button id="vrec" class="sbtn" style="--c:#ff8fb1">🎙️<span>Voice — tahan rekam</span></button>
          <button id="doodBtn" class="sbtn" style="--c:#5cc8ff">🎨<span>Doodle</span></button>
          <button id="lwrite" class="sbtn" style="--c:#ffd166">✍️<span>Surat</span></button>
          <button id="capBtn2" class="sbtn" style="--c:#c58bff">🎁<span>Kado</span></button>
        </div>
        <div class="muted" id="vstate" style="margin-top:8px;min-height:16px"></div>
        <div id="doodWrap" style="display:none;margin-top:10px">
          <canvas id="doodle" width="300" height="300"></canvas>
          <div class="penrow">${['#ffffff', '#ff8fb1', '#5cc8ff', '#ffd166', '#7ee8a2'].map((c, i) => `<button class="pen ${i === 0 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
          <div class="hqin"><button id="doodSend" class="mini" style="flex:1">Kirim 🎨</button><button id="doodClear" class="mini ghost">Hapus</button></div>
        </div>
        <div id="vlist" style="margin-top:6px"></div>
        <div id="llist" style="margin-top:8px"></div>
      </div>
      <details class="msect mfold"><summary>📜 Riwayat kangen</summary><div class="histlist" id="missHist"></div></details>
    </div>`;
    $('#doodBtn').onclick = () => { const w = $('#doodWrap'); w.style.display = w.style.display === 'none' ? '' : 'none'; };
    $('#missBig').onclick = missTap;
    setupVoice();
    loadVoices();
    $$('.care').forEach(b => b.onclick = () => { socket.emit('care:send', { kind: b.dataset.k }); toast(`Terkirim ke ${pname()} ${b.textContent.trim().slice(0, 2)}`); });
    const tb = $('#touchBtn');
    const tOn = () => { socket.emit('touch:start'); $('#touchState').textContent = `menunggu ${pname()}…`; tb.classList.add('on'); };
    const tOff = () => { socket.emit('touch:end'); tb.classList.remove('on'); setTimeout(() => { const s = $('#touchState'); if (s && s.textContent.startsWith('menunggu')) s.textContent = ''; }, 600); };
    tb.onpointerdown = tOn; tb.onpointerup = tOff; tb.onpointerleave = tOff; tb.onpointercancel = tOff;
    $$('.tod').forEach(b => b.onclick = () => socket.emit('tod:request', { mode: b.dataset.m }));
    $('#nobar').onclick = () => { socket.emit('nobar:start'); toast(`Ngajak ${pname()} nobar… 🎬`); };
    $('#focusBtn').onclick = () => { socket.emit('focus:start', { dur: 25 }); toast(`Ngajak ${pname()} fokus bareng ⏱️`); };
    $('#tttBtn').onclick = () => { if (!tttG?.done) { socket.emit('ttt:invite'); $('#tttState').textContent = `nunggu ${pname()} terima… ⏳`; } else socket.emit('ttt:again'); };
    if (tttG) renderTtt(tttG);
    $('#guessBtn').onclick = () => { socket.emit('guess:start'); guessMode('draw'); };
    $('#quizBtn').onclick = quizMenu;
    // leaderboard mingguan
    api('/scores/week').then(sc => {
      const el = $('#wkScore'); if (!el || !sc) return;
      const parts = [];
      if (sc.suit) parts.push(`✊ ${sc.suit.me}–${sc.suit.them}`);
      if (sc.ttt) parts.push(`⭕ ${sc.ttt.me}–${sc.ttt.them}`);
      el.textContent = parts.length ? `🏅 minggu ini — ${parts.join(' · ')}${parts.some(p => +p.match(/(\d+)/)[1] < +p.match(/–(\d+)/)[1]) ? '' : ''}` : '';
    }).catch(() => {});
    setupDoodle();
    $('#capBtn2').onclick = capsuleMenu;
    $('#lwrite').onclick = letterWrite;
    loadLetters();
    $$('.suit').forEach(b => b.onclick = () => {
      suitMyPick = b.dataset.h;
      $$('.suit').forEach(x => x.classList.toggle('on', x === b));
      socket.emit('suit:pick', { hand: b.dataset.h });
      $('#suitState').textContent = suitWaiting ? '✨' : `kamu pilih ${b.dataset.h} — nunggu ${pname()}…`;
    });
    return loadMissTab();
  }
  if (tab === 'sched') {
    v.innerHTML = `<div class="list">
      <div class="segtoggle"><button id="segList" class="on">📋 List</button><button id="segCal">📅 Kalender</button></div>
      <div class="hcard" style="gap:9px">
        <div class="hlabel">➕ Jadwal baru</div>
        <input id="st" placeholder="Judul (misal: ☕ Call yuk)" maxlength="80">
        <div class="hqin"><input id="stime" type="datetime-local"><select id="srep"><option value="">sekali</option><option value="daily">🔁 harian</option><option value="weekly">🔁 mingguan</option></select></div>
        <button id="sadd">Tambah</button>
      </div>
      <div id="scal" style="display:none"></div>
      <div id="slist"></div>
      <div class="msect" style="margin-top:14px"><b>🪣 Bucket list bersama</b>
        <div class="hqin"><input id="bucketIn" placeholder="Impian bareng (misal: nonton aurora)" maxlength="120"><button id="bucketAdd" class="mini">+</button></div>
        <div id="blist"></div></div>
    </div>`;
    const nx = new Date(Date.now() + 3600000);
    $('#stime').min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('#stime').value = new Date(nx.getTime() - nx.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('#sadd').onclick = addSchedule;
    $('#st').onkeydown = e => { if (e.key === 'Enter') addSchedule(); };

    $('#segList').onclick = () => { $('#segList').classList.add('on'); $('#segCal').classList.remove('on'); $('#scal').style.display = 'none'; $('#slist').style.display = ''; };
    $('#segCal').onclick = () => { $('#segCal').classList.add('on'); $('#segList').classList.remove('on'); $('#slist').style.display = 'none'; $('#scal').style.display = ''; renderCal(); };
    $('#bucketAdd').onclick = addBucket;
    $('#bucketIn').onkeydown = e => { if (e.key === 'Enter') addBucket(); };
    loadSchedules(); loadBucket(); return;
  }
  if (tab === 'ai') {
    v.innerHTML = `<div id="chat">
      <div class="aihead"><div class="aiavatar" id="aiprof" style="cursor:pointer">✦</div><div style="cursor:pointer" id="aiprof2"><b>${esc(me.user.ai_name || 'AI')}</b><span>${me.user.ai_name ? 'bestie AI-mu · tap = profil' : 'tap = kasih nama'}</span></div>
      <button id="vmode" class="mini" title="Mode suara: ngobrol hands-free">🎙️</button>
      <button id="aiToggle" class="mini">${me.user.ai_enabled ? '🔊 ON' : '🔇 OFF'}</button></div>
      <div id="msgs"></div>
      <div id="chips"><button class="chip">Jadwal hari ini apa?</button><button class="chip">Dia di mana?</button><button class="chip">Cuaca sekarang gimana?</button><button class="chip">Lagi kangen nih</button><button class="chip">💌 Puisi buat dia</button><button class="chip">💡 Ide date weekend</button><button class="chip">🫶 Semangatin aku dong</button><button class="chip">🌙 Ucapan malem buat dia</button></div>
      <div id="chatform"><button id="micBtn">🎤</button><input id="cin" placeholder="Tulis pesan…" maxlength="500"><button id="csend">➤</button></div></div>`;
    if (!chatMsgs.length) chatMsgs.push({ role: 'ai', text: `Hai ${me.user.name}! Aku ${aiName()} ✦ mau ngobrol apa? Tanya jadwal atau lokasi ${pname()} juga bisa.`, ts: Date.now() });
    renderMsgs();
    document.querySelectorAll('#chips .chip').forEach(c => c.onclick = () => { $('#cin').value = c.textContent; sendChat(); });
    $('#csend').onclick = sendChat; $('#cin').onkeydown = e => { if (e.key === 'Enter') sendChat(); };
    $('#aiToggle').onclick = async (e) => {
      me.user.ai_enabled = !me.user.ai_enabled;
      await api('/ai/toggle', { method: 'POST', body: { on: me.user.ai_enabled } });
      e.target.textContent = me.user.ai_enabled ? '🔊 ON' : '🔇 OFF';
      if (!me.user.ai_enabled) { window.speechSynthesis?.cancel(); ttsAudio?.pause(); }
      toast(me.user.ai_enabled ? 'Suara AI aktif' : 'Suara AI dimatikan');
    };
    $('#aiprof').onclick = aiProfile; $('#aiprof2').onclick = aiProfile;
    $('#vmode').onclick = () => {
      voiceMode = !voiceMode;
      $('#vmode').classList.toggle('on', voiceMode);
      if (voiceMode) {
        if (!me.user.ai_enabled) { me.user.ai_enabled = true; api('/ai/toggle', { method: 'POST', body: { on: true } }); $('#aiToggle').textContent = '🔊 ON'; }
        toast(`🎙️ Mode suara — ngobrol terus sama ${aiName()}, ketuk lagi buat berhenti`, 4000);
        try { aiRec?.start(); $('#micBtn').classList.add('rec'); } catch {}
      } else {
        try { aiRec?.stop(); speechSynthesis?.cancel(); ttsAudio?.pause(); } catch {}
        toast('Mode suara mati');
      }
    };
    setupMic('#micBtn', '#cin');
    // mic = mode ngobrol kontinyu — bukan mic sekali terus berhenti
    $('#micBtn').onclick = () => $('#vmode').click();
    $('#micBtn').title = 'Ketuk = ngobrol terus sama ' + aiName();
    return;
  }
  if (tab === 'kita') return renderKita(v);
}

// ---------- TAB KITA — hubungan & utilitas ----------
function renderKita(v) {
  v.innerHTML = `<div class="list">
    <div class="msect"><b>💕 Kalian</b>
      <div class="srow"><span>💕 Bareng</span><b>hari ke-${daysTogether()}</b></div>
      <div class="srow"><span>📅 Sejak</span><b>${new Date(sinceTs()).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
      <div class="srow"><span>🎂 Monthsary</span><b>${nextMonthsary().months} bulan · ${nextMonthsary().days} hari lagi</b></div>
      <div class="hsub" style="margin-top:2px">panggilan sayang buat dia:</div>
      <div class="hqin"><input id="petIn" placeholder="Panggilan sayang buat dia" maxlength="30" value="${esc(me.user.pet_name || '')}"><button id="petBtn" class="mini">💗</button></div>
      <div class="hsub" style="margin-top:2px">tanggal ketemu berikutnya:</div>
      <div class="hqin"><input id="meetIn" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${me.pair.next_meet ? new Date(me.pair.next_meet).toISOString().slice(0, 10) : ''}"><button id="meetBtn" class="mini">✈️</button></div>
      <div class="hsub" style="margin-top:2px">lagu kalian:</div>
      <div class="hqin"><input id="songIn" placeholder="🎵 Lagu kita" maxlength="60" value="${esc(me.pair.song || '')}"><button id="songBtn" class="mini">🎵</button></div>
    </div>
    <div class="msect"><b>📊 Statistik kalian</b>
      <div class="statgrid" id="statGrid"><div class="hsub">memuat…</div></div>
    </div>
    <div class="msect"><b>🎨 Tema</b>
      <div class="themrow">${[['', '🌊', 'Langit'], ['dark', '🌙', 'Gelap'], ['light', '☀️', 'Terang'], ['sakura', '🌸', 'Sakura'], ['lavender', '💜', 'Lavender'], ['forest', '🌿', 'Hutan']].map(([t, e, n]) => `<button class="tswatch ${(document.documentElement.dataset.theme || '') === t ? 'on' : ''}" data-t="${t}"><span>${e}</span><i>${n}</i></button>`).join('')}</div>
    </div>
    <details class="msect mfold"><summary>📦 Lainnya</summary>
      <button id="bakBtn" class="ghost">🔑 Kode cadangan akun</button>
      <div id="bakBox" style="display:none" class="bakbox">
        <div class="hsub">Simpan kode ini baik-baik — kalau ganti HP / data kehapus, masuk pakai kode ini biar akun &amp; pair-mu balik.</div>
        <div class="bakcode" id="bakCode">${localStorage.cw_token || ''}</div>
        <button id="bakCopy" class="mini">📋 Salin kode</button>
      </div>
      <button id="wrapBtn" class="ghost">📊 Rekap bulan ini</button>
      <button id="wrapYr" class="ghost">🗓️ Rekap ${new Date().getFullYear()}</button>
      <button id="exportBtn" class="ghost">⬇️ Export semua data</button>
      <button id="tourBtn" class="ghost">🧭 Tour aplikasi</button>
      ${deferredInstall ? '<button id="install" class="ghost">📲 Install aplikasi</button>' : ''}
      ${!deferredInstall && /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone ? '<button id="iosInstall" class="ghost">📲 Cara install di iPhone</button>' : ''}
      <button id="brk" class="ghost" style="border-color:var(--accent);color:var(--accent)">💔 Putus pair</button>
    </details>
  </div>`;
  const q = (s) => v.querySelector(s);
  q('#petBtn').onclick = async () => {
    const t = q('#petIn').value.trim();
    me.user.pet_name = t;
    await api('/profile', { method: 'POST', body: { pet_name: t } });
    const hn = $('.whoinfo .pname'); if (hn) hn.childNodes[0].textContent = pname() + (me.partner.mood ? ' ' + me.partner.mood : '') + ' ';
    toast(t ? `Dia jadi "${t}" 💗` : 'Panggilan dihapus');
  };
  q('#meetBtn').onclick = async () => {
    const dv = q('#meetIn').value; if (!dv) return toast('Pilih tanggal dulu');
    const ts = new Date(dv + 'T12:00:00').getTime();
    await api('/meet', { method: 'POST', body: { ts } });
    me.pair.next_meet = ts; toast('Tanggal ketemu disimpan ✈️');
  };
  q('#songBtn').onclick = async () => {
    const t = q('#songIn').value.trim();
    await api('/song', { method: 'POST', body: { text: t } });
    me.pair.song = t; toast(t ? `🎵 "${t}" — lagu kalian!` : 'Lagu dihapus');
  };
  q('.themrow') && v.querySelectorAll('.tswatch').forEach(b => b.onclick = () => {
    document.documentElement.dataset.theme = b.dataset.t;
    localStorage.cw_theme = b.dataset.t;
    v.querySelectorAll('.tswatch').forEach(x => x.classList.toggle('on', x === b));
  });
  // statistik pasangan — gabungan beberapa endpoint
  (async () => {
    const grid = q('#statGrid'); if (!grid) return;
    const [ms, ss, mems, pins] = await Promise.all([
      api('/miss/stats').catch(() => null), api('/suit/stats').catch(() => null),
      api('/memories').catch(() => []), api('/pins').catch(() => []),
    ]);
    const w = (g) => { const s = ss?.[g]; return s ? `${s.w}–${s.l}` : '0–0'; };
    grid.innerHTML = [
      ['💓', (ms?.sent || 0) + (ms?.received || 0), 'kangen minggu ini'],
      ['🔥', ms?.streak || 0, 'streak hari'],
      ['🖼️', (mems || []).length, 'kenangan'],
      ['📌', (pins || []).length, 'tempat favorit'],
      ['✊', w('suit'), 'suit (kamu–dia)'],
      ['⭕', w('ttt'), 'xoxo (kamu–dia)'],
    ].map(([e, n, l]) => `<div class="statcell"><b>${e} ${n}</b><span>${l}</span></div>`).join('');
  })();
  q('#bakBtn').onclick = () => { const b = q('#bakBox'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
  q('#bakCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(localStorage.cw_token || ''); toast('Kode disalin 📋 — simpan di tempat aman!'); }
    catch { prompt('Salin kode ini:', localStorage.cw_token || ''); }
  };
  q('#wrapBtn').onclick = () => wrappedModal();
  q('#wrapYr').onclick = () => wrappedModal('year');
  q('#exportBtn').onclick = async () => {
    const r = await fetch('/api/export', { headers: { 'x-token': localStorage.cw_token } });
    if (!r.ok) return toast('gagal export');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ryora-export.json'; a.click();
    URL.revokeObjectURL(a.href); toast('Data di-export ⬇️');
  };
  q('#tourBtn').onclick = () => { delete localStorage.cw_toured; tour(); };
  const ins = q('#install');
  if (ins) ins.onclick = async () => { deferredInstall?.prompt(); deferredInstall = null; ins.remove(); };
  const ios = q('#iosInstall');
  if (ios) ios.onclick = () => toast('Di Safari: tap Share (kotak panah ke atas) → "Add to Home Screen"', 7000);
  q('#brk').onclick = async () => {
    if (confirm('Yakin putus pair? Semua data jadwal & kangen dihapus.')) { await api('/pair/break', { method: 'POST' }); location.reload(); }
  };
}

// ---------- KADO KEJUTAN (dari tombol 🎁 di Kangen) ----------
function capsuleMenu() {
  if ($('.settings')) return;
  const el = document.createElement('div'); el.className = 'settings card';
  el.innerHTML = `<h3>🎁 Kado kejutan</h3>
    <div class="muted" style="font-size:12px">tulis pesan rahasia — dia baru bisa baca di tanggal pilihanmu 🔒</div>
    <textarea id="capIn" placeholder="Pesan buat dia nanti…" maxlength="1000" rows="3"></textarea>
    <div class="hqin"><input id="capDate" type="datetime-local" min="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + 3600000).toISOString().slice(0, 16)}"><button id="capBtn" class="mini">🎁</button></div>
    <div id="capList"></div>
    <button id="ccls" class="ghost">Tutup</button>`;
  $('#view').appendChild(el);
  el.querySelector('#ccls').onclick = () => el.remove();
  el.querySelector('#capBtn').onclick = async () => {
    const t = el.querySelector('#capIn').value.trim(), dv = el.querySelector('#capDate').value;
    if (!t) return toast('Tulis pesannya dulu');
    if (!dv) return toast('Pilih tanggal bukanya');
    const ts = new Date(dv).getTime();
    if (ts <= Date.now()) return toast('Tanggal harus di masa depan');
    const r = await api('/capsule', { method: 'POST', body: { text: t, unlock_ts: ts } });
    if (r.ok) { el.querySelector('#capIn').value = ''; toast(`🎁 Kado terkunci sampai ${new Date(ts).toLocaleDateString('id-ID')} 🔒`); loadCapsules(); }
    else toast(r.error || 'gagal');
  };
  loadCapsules();
}

// ---------- QUIZ "SEBERAPA KENAL" ----------
const simMatch = (a, b) => {
  const wa = String(a).toLowerCase().split(/\W+/).filter(w => w.length >= 3);
  const wb = new Set(String(b).toLowerCase().split(/\W+/).filter(w => w.length >= 3));
  return wa.some(w => wb.has(w));
};
async function quizMenu() {
  $('.settings')?.remove();
  const d = await api('/quiz');
  if (!d) return;
  const el = document.createElement('div'); el.className = 'settings card';
  const revealRows = (answers, guesses, aName, gName) => d.qs.map((q, i) => `
    <div class="qrow"><div class="qq">${esc(q)}</div>
    <div class="qa">${esc(answers[i])} <i>— ${esc(aName)}</i></div>
    <div class="qa ${simMatch(answers[i], guesses[i]) ? 'hit' : 'miss'}">${simMatch(answers[i], guesses[i]) ? '✅' : '💭'} ${esc(guesses[i])} <i>— tebakan ${esc(gName)}</i></div></div>`).join('');
  const guessForm = (idpfx) => d.qs.map((q, i) => `<div class="hsub" style="text-align:left;margin-top:6px">${esc(q)}</div><input id="${idpfx}${i}" maxlength="120" placeholder="tebakanmu…">`).join('');
  let html = `<h3>💘 Seberapa kenal</h3>`;
  // bagian tebak jawaban dia
  if (d.theirs && !d.theirs.myGuesses) {
    html += `<div class="ssect"><b>🔮 Tebak jawaban ${esc(d.theirs.by)}</b>${guessForm('qg')}<button id="qsend" class="mini" style="width:100%">Kirim tebakan</button></div>`;
  } else if (d.theirs && d.theirs.myGuesses) {
    const score = d.theirs.answers.filter((a, i) => simMatch(a, d.theirs.myGuesses[i])).length;
    html += `<div class="ssect"><b>🔮 Tebakanmu vs jawaban ${esc(d.theirs.by)} — ${score}/3!</b>${revealRows(d.theirs.answers, d.theirs.myGuesses, d.theirs.by, 'kamu')}</div>`;
  } else {
    html += `<div class="ssect"><b>🔮 Tebak dia</b><div class="hsub">${esc(pname())} belum isi quiz hari ini — ingetin dia ya!</div></div>`;
  }
  // bagian quiz-mu
  if (d.mine) {
    html += d.mine.theirGuesses
      ? `<div class="ssect"><b>📋 Tebakan ${esc(d.mine.theirName || 'dia')} vs jawabanmu</b>${revealRows(d.mine.answers, d.mine.theirGuesses, 'kamu', d.mine.theirName || 'dia')}</div>`
      : `<div class="ssect"><b>📋 Quiz-mu</b><div class="hsub">jawabanmu tersimpan — nunggu ${esc(d.mine.theirName || 'dia')} nebak…</div></div>`;
  } else {
    html += `<div class="ssect"><b>✍️ Isi jawabanmu (tentang dirimu)</b>${guessForm('qm')}<button id="qmine" class="mini" style="width:100%">Simpan & tantang dia</button></div>`;
  }
  html += `<button id="qcls" class="ghost">Tutup</button>`;
  el.innerHTML = html;
  $('#view').appendChild(el);
  el.querySelector('#qcls').onclick = () => el.remove();
  el.querySelector('#qsend')?.addEventListener('click', async () => {
    const guesses = [0, 1, 2].map(i => el.querySelector('#qg' + i).value.trim());
    if (guesses.some(g => !g)) return toast('Isi semua tebakan dulu');
    const r = await api('/quiz/guess', { method: 'POST', body: { guesses } });
    if (r.ok) { el.remove(); quizMenu(); toast('Tebakan terkirim! Lihat jawaban aslinya 💘'); }
    else toast(r.error || 'gagal');
  });
  el.querySelector('#qmine')?.addEventListener('click', async () => {
    const answers = [0, 1, 2].map(i => el.querySelector('#qm' + i).value.trim());
    if (answers.some(a => !a)) return toast('Isi semua jawaban dulu');
    const r = await api('/quiz', { method: 'POST', body: { answers } });
    if (r.ok) { el.remove(); quizMenu(); toast(`Quiz terkirim — ${pname()} dikasih notif buat nebak! 💘`); }
    else toast(r.error || 'gagal');
  });
}

// ---------- HOME / WIDGET DASHBOARD ----------
async function renderHome(v) {
  v.innerHTML = `<div class="home"><div class="hskel"><i></i><i></i><i></i><i></i></div></div>`;
  const d = await api('/home');
  if (!d || currentTab !== 'home' || !$('#view .home')) return;
  const p = me.partner;
  const next = schedCache.map(s => ({ s, t: nextOcc(s) })).filter(x => x.t > Date.now() - 60000).sort((a, b) => a.t - b.t)[0]?.s;
  const answered = !!d.myAnswer, both = answered && !!d.theirAnswer;
  // monthsary hari ini? — tanggal jadian & bukan hari pertama
  const c0 = new Date(sinceTs()), n0 = new Date();
  const isMday = c0.getDate() === n0.getDate() && daysTogether() > 28;
  const mNum = (n0.getFullYear() - c0.getFullYear()) * 12 + (n0.getMonth() - c0.getMonth());
  // ultah — countdown kalau ≤ 14 hari, banner + konfetti pas harinya
  const myB = bdayIn(me.user.bday), theirB = bdayIn(p.bday);
  const bdayBanner = theirB === 0 ? `<div class="hcard mday">🎂 <b>Hari ini ultah ${esc(pname())}!</b><span>Ucapiin dia sekarang 🎉</span></div>`
    : myB === 0 ? `<div class="hcard mday">🎂 <b>Selamat ulang tahun, ${esc(me.user.name)}!</b><span>Hari spesialmu 🎉</span></div>` : '';
  const bdayChip = theirB != null && theirB > 0 && theirB <= 14 ? `<div class="hchip">🎂 ultahnya ${theirB} hari lagi</div>`
    : myB != null && myB > 0 && myB <= 14 ? `<div class="hchip">🎂 ultahmu ${myB} hari lagi</div>` : '';
  v.innerHTML = `<div class="home">
    ${isMday ? `<div class="hcard mday">🎂 <b>Monthsary ke-${mNum}!</b><span>${mNum} bulan kalian bareng 💕</span></div>` : ''}
    ${bdayBanner}
    <div class="hcard pcard">
      <span class="avatar big">${esc(av(p))}</span>
      <div class="pinfo"><b>${esc(pname())} ${p.mood || ''}</b>
        <span>${partnerOnline ? '🟢 online' : '⚪ ' + (partnerSeen ? 'aktif ' + agoText(partnerSeen) : 'offline')}${distText() ? ' · 📍 ' + distText() : ''}</span>
        <span id="hstatus" class="stag">${esc(p.status || '')}</span>
        ${me.pair.song ? `<span class="songline">🎵 ${esc(me.pair.song)}</span>` : ''}
      </div>
      <div class="hdays">💕<b>${daysTogether()}</b><span>hari</span></div>
    </div>
    <div class="hchips">
      <div class="hchip">🔥 ${d.streak || 0} hari</div>
      ${me.pair.next_meet ? `<div class="hchip" id="hNext">✈️ ${(() => { const dd = Math.ceil((me.pair.next_meet - Date.now()) / 86400000); return dd > 0 ? dd + ' hari lagi' : 'ketemu hari ini!'; })()}</div>`
        : next ? `<div class="hchip" id="hNext">⏰ ${new Date(next.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ${esc(next.title.slice(0, 10))}</div>`
        : `<div class="hchip" id="hNext">🎂 ${nextMonthsary().days} hari → monthsary</div>`}
      ${bdayChip}
      <div class="hchip" id="hAsk">📸 lagi apa?</div>
      <div class="hchip" id="hWrap2">📊 rekap</div>
      <div class="hchip" id="hWx">🌦️…</div>
    </div>
    <div class="hcard" id="moodCard" style="display:none">
      <div class="hlabel">😊 Mood minggu ini</div>
      <div id="moodWeek"></div>
    </div>
    <div class="hcard">
      <div class="hlabel">❓ Pertanyaan hari ini</div>
      <div class="hq">${esc(d.q || '')}</div>
      ${!answered ? `<div class="hqin"><input id="hans" placeholder="Jawabanmu…" maxlength="200"><button id="hansBtn" class="mini">Kirim</button></div><div class="hsub">jawaban dia kebuka setelah kamu jawab</div>`
        : both ? `<div class="hans"><b>${esc(me.user.name)}:</b> ${esc(d.myAnswer)}</div><div class="hans theirs"><b>${esc(pname())}:</b> ${esc(d.theirAnswer)}</div>` + reactRow('answer', d.answerReacts, todayKey())
        : `<div class="hans"><b>Kamu:</b> ${esc(d.myAnswer)}</div><div class="hsub">menunggu ${esc(pname())} jawab… 🤫</div>`}
    </div>
    <div class="hcard">
      <div class="hlabel">📝 Catatan buat dia <span class="hsub">(tampil di home-nya)</span></div>
      ${d.theirNote ? `<div class="hnote">${esc(d.theirNote)}<span class="hfrom">— ${esc(pname())}</span></div>` : ''}
      <div class="hqin"><input id="hnote" placeholder="Tulis catatan kecil…" maxlength="200" value="${esc(d.myNote || '')}"><button id="hnoteBtn" class="mini">💌</button></div>
    </div>
    <div class="hcard">
      <div class="hlabel">📸 Foto hari ini</div>
      <div class="hphotos" id="hphotos">` +
        (d.photos?.length ? d.photos.map(ph => `<div class="hphoto ${ph.mine ? '' : 'theirs'}"><img src="${ph.img}"><span>${ph.mine ? 'Kamu' : esc(pname())}${ph.caption ? ' · ' + esc(ph.caption) : ''}</span>${ph.mine ? '' : reactRow('photo', ph.reacts, todayKey() + ':' + p.id)}</div>`).join('') : '<div class="hsub">belum ada foto — kirim momen harimu 📷</div>') +
      `</div>
      <label class="hphotobtn">📷 Kirim foto<input type="file" id="hfile" accept="image/*" capture="environment" hidden></label>
    </div>
    <div class="hcard">
      <div class="hlabel">🖼️ Kenangan <span class="hsub">(album kalian)</span></div>
      <div class="hphotos" id="hmems"></div>
      <div class="hqin"><label class="hphotobtn" style="flex:1;margin:0">📷 Tambah kenangan<input type="file" id="mfile" accept="image/*" hidden></label></div>
    </div>
    ${d.feed?.length ? `<div class="hcard"><div class="hlabel">⚡ Aktivitas kalian</div>
      ${d.feed.map(f => `<div class="feedrow"><span class="fwho ${f.mine ? '' : 'them'}">${esc(f.mine ? 'Kamu' : f.who)}</span><span class="ftxt">${esc(f.text)}</span><span class="fwhen">${agoText(f.ts)}</span></div>`).join('')}
    </div>` : ''}
  </div>`;
  $('#hWrap2') && ($('#hWrap2').onclick = () => wrappedModal());
  $('#hAsk').onclick = () => { socket.emit('photo:request'); toast(`Nanya ${pname()} lagi apa 📸…`); };
  api('/weather').then(w => {
    const el2 = $('#hWx'); if (!el2 || !w) return;
    const wd = (x) => x ? (x.code >= 60 ? '🌧️' : x.code >= 50 ? '🌦️' : x.code >= 3 ? '☁️' : x.code ? '⛅' : '☀️') + x.t + '°' : null;
    const a = wd(w.me), b = wd(w.partner);
    el2.textContent = a && b ? `${a} kamu · ${b} dia` : a ? `${a} kamu` : b ? `${b} dia` : '';
    if (!a && !b) el2.style.display = 'none';
  }).catch(() => { const el2 = $('#hWx'); if (el2) el2.style.display = 'none'; });
  v.querySelectorAll('.hphoto img').forEach(img => { img.style.cursor = 'zoom-in'; img.onclick = () => photoViewer(img.src); });
  // streak celebration — sekali per milestone
  const MS = [7, 14, 21, 30, 50, 100, 200, 365];
  const hit = MS.find(m => (d.streak || 0) >= m);
  if (hit && +(localStorage.cw_streak_seen || 0) < hit) {
    localStorage.cw_streak_seen = hit;
    heartRain(50); ding(); navigator.vibrate?.([300, 100, 300, 100, 300]);
    toast(`🔥 STREAK ${hit} HARI! Kalian luar biasa 💕`, 5000);
  }
  // monthsary confetti — sekali per tanggal
  if (isMday && localStorage.cw_mday !== n0.toDateString()) {
    localStorage.cw_mday = n0.toDateString();
    heartRain(60); ding(); navigator.vibrate?.([300, 120, 300, 120, 400]);
    toast(`🎂 Happy monthsary ke-${mNum}! 💕`, 6000);
  }
  // ultah confetti — sekali per tanggal
  if ((theirB === 0 || myB === 0) && localStorage.cw_bday !== n0.toDateString()) {
    localStorage.cw_bday = n0.toDateString();
    heartRain(80); ding(); navigator.vibrate?.([300, 120, 300, 120, 500]);
    toast(theirB === 0 ? `🎉 HARI INI ULTAH ${pname()}! Ucapiin sekarang 🎂` : `🎉 SELAMAT ULANG TAHUN! 🎂`, 8000);
  }
  // mood minggu ini
  api('/mood/week').then(mw => {
    const card = $('#moodCard'), box = $('#moodWeek');
    if (!card || !box || !mw) return;
    const days = [];
    for (let i = 6; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); days.push(dt); }
    const row = (obj, who) => `<div class="mwrow"><span class="mwwho">${who}</span>` +
      days.map(dt => `<i class="mwc ${dt.toDateString() === new Date().toDateString() ? 'today' : ''}">${obj[dt.toDateString()] || '·'}</i>`).join('') + '</div>';
    const html = row(mw.me, 'Kamu') + row(mw.them, esc(pname()));
    if (Object.keys(mw.me).length || Object.keys(mw.them).length) { box.innerHTML = html; card.style.display = ''; }
  }).catch(() => {});
  v.querySelectorAll('.hreact button').forEach(b => b.onclick = async () => {
    const row = b.closest('.hreact');
    const tid = row.dataset.tid || todayKey();
    const on = !b.classList.contains('on');
    await api('/react', { method: 'POST', body: { type: row.dataset.t, tid, emoji: on ? b.dataset.e : null } });
    renderHome(v);
  });
  $('#hNext').onclick = () => { document.querySelectorAll('nav button').forEach(x => x.classList.remove('on')); document.querySelector('[data-t="sched"]').classList.add('on'); show('sched'); };

  const ansBtn = $('#hansBtn');
  if (ansBtn) {
    const send = async () => { const t = $('#hans').value.trim(); if (!t) return; await api('/daily/answer', { method: 'POST', body: { text: t } }); renderHome(v); };
    ansBtn.onclick = send; $('#hans').onkeydown = e => { if (e.key === 'Enter') send(); };
  }
  $('#hnoteBtn').onclick = async () => {
    await api('/note', { method: 'POST', body: { text: $('#hnote').value.trim() } });
    toast('Catatan tersimpan 💌');
  };

  api('/memories').then(mems => {
    const el = $('#hmems'); if (!el) return;
    // 🕰️ "hari ini N lalu" — kenangan di tanggal sama bulan/tahun lalu
    const tn = new Date();
    const otd = mems.find(m => { const d = new Date(m.ts); return d.getDate() === tn.getDate() && d.getMonth() === tn.getMonth() && d.getFullYear() < tn.getFullYear(); })
      || mems.find(m => { const d = new Date(m.ts); return d.getDate() === tn.getDate() && (tn - m.ts) > 28 * 86400000; });
    const otdHtml = otd ? (() => {
      const d = new Date(otd.ts);
      const mo = (tn.getFullYear() - d.getFullYear()) * 12 + (tn.getMonth() - d.getMonth());
      const label = mo >= 12 ? `${Math.floor(mo / 12)} tahun lalu hari ini` : `${mo} bulan lalu hari ini`;
      return `<div class="hphoto otd"><img src="${otd.img}"><span>🕰️ ${label}${otd.caption ? ' · ' + esc(otd.caption) : ''}</span></div>`;
    })() : '';
    el.innerHTML = mems.length ? otdHtml + mems.filter(m => m !== otd).slice(0, otd ? 3 : 4).map(m => `<div class="hphoto"><img src="${m.img}"><span>${m.mine ? 'Kamu' : esc(m.from_name || '?')}${m.caption ? ' · ' + esc(m.caption) : ''}${m.mine ? `<b class="mdel" data-id="${m.id}">×</b>` : ''}</span></div>`).join('') + (mems.length > 4 ? `<div class="hphoto more"><span>+${mems.length - 4} lagi</span></div>` : '')
      : '<div class="hsub">belum ada kenangan — abadikan momen pertama 📷</div>';
    el.querySelectorAll('.mdel').forEach(x => x.onclick = async e => { e.stopPropagation(); await api('/memory/' + x.dataset.id, { method: 'DELETE' }); renderHome(v); });
    el.querySelectorAll('.hphoto img').forEach(img => { img.style.cursor = 'zoom-in'; img.onclick = () => photoViewer(img.src); });
  });
  $('#mfile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', .72);
      const caption = prompt('Caption (opsional):') || '';
      api('/memory', { method: 'POST', body: { img: data, caption } }).then(r => {
        if (r.ok) { toast('Kenangan tersimpan 🖼️'); renderHome(v); } else toast(r.error || 'gagal simpan');
      });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  $('#hfile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 640 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', .62);
      const caption = prompt('Caption (opsional):') || '';
      api('/photo', { method: 'POST', body: { img: data, caption } }).then(r => {
        if (r.ok) { toast('Foto terkirim 📸'); renderHome(v); } else toast(r.error || 'gagal kirim');
      });
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
}

function photoViewer(src) {
  const el = document.createElement('div'); el.className = 'wmodal';
  el.style.background = 'rgba(5,15,30,.94)';
  el.innerHTML = `<img src="${src}" style="max-width:94vw;max-height:86vh;border-radius:14px;box-shadow:0 10px 60px rgba(0,0,0,.6)">`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

const aiName = () => me?.user?.ai_name || 'AI';
const pname = () => me?.user?.pet_name || me?.partner?.name || '—'; // panggilan sayang
const av = (u) => u?.avatar || (u?.name || '?')[0].toUpperCase();
const isQuiet = () => { // jam tenang — ping & getar ditahan
  const f = me?.user?.dnd_from, t = me?.user?.dnd_to;
  if (f == null || t == null) return false;
  const h = new Date().getHours();
  return f <= t ? (h >= f && h < t) : (h >= f || h < t);
};
const bdayIn = (b) => { // hari menuju ultah (0 = hari ini), null kalau nggak diisi
  if (!b) return null;
  const n = new Date(), parts = String(b).slice(0, 10).split('-').map(Number);
  if (parts.length < 3) return null;
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  let t = new Date(n.getFullYear(), parts[1] - 1, parts[2]);
  if (t < today) t = new Date(n.getFullYear() + 1, parts[1] - 1, parts[2]);
  return Math.round((t - today) / 86400000);
};
const nextOcc = (s) => { // jadwal berulang → waktu occurrence berikutnya
  if (!s.repeat) return s.start_time;
  const step = s.repeat === 'daily' ? 86400000 : 7 * 86400000;
  let t = s.start_time;
  while (t + 3600000 < Date.now()) t += step;
  return t;
};
const sinceTs = () => me.pair.since || me.pair.created_at;
const daysTogether = () => Math.floor((Date.now() - sinceTs()) / 86400000) + 1;
const nextMonthsary = () => {
  const c = new Date(sinceTs()), n = new Date();
  let m = new Date(n.getFullYear(), n.getMonth(), c.getDate());
  if (m <= n) m = new Date(n.getFullYear(), n.getMonth() + 1, c.getDate());
  const months = (m.getFullYear() - c.getFullYear()) * 12 + (m.getMonth() - c.getMonth());
  return { months, days: Math.ceil((m - n) / 86400000) };
};
// ---------- XOXO ----------
let tttG = null, tttMark = null;
function renderTtt(g) {
  const box = $('#tttBoard'), st = $('#tttState'), btn = $('#tttBtn');
  if (!box) return; // tab kangen belum kebuka — state tetap kesimpen di tttG
  box.style.display = 'grid';
  box.innerHTML = g.board.map((v, i) => `<button class="tttc ${v}" data-i="${i}">${v === 'x' ? '❌' : v === 'o' ? '⭕' : ''}</button>`).join('');
  box.querySelectorAll('.tttc').forEach(b => b.onclick = () => { if (!b.textContent) socket.emit('ttt:move', { cell: +b.dataset.i }); });
  if (g.done) {
    st.textContent = g.winner === 'draw' ? '🤝 seri!' : g.winner === tttMark ? '🎉 KAMU MENANG!' : `😆 ${pname()} menang!`;
    btn.textContent = '🔁 Main lagi'; btn.style.display = '';
    if (g.winner === tttMark) { heartRain(25); ding(); navigator.vibrate?.([200, 100, 200]); }
  } else {
    st.textContent = g.turn === tttMark ? '✨ giliran kamu' : `giliran ${pname()}…`;
    btn.style.display = 'none';
  }
}

// ---------- TEBAK DOODLE ----------
let guessRole = null;
function guessMode(role) {
  guessRole = role;
  const wrap = $('#guessWrap'), cv = $('#guessCv'), st = $('#guessState'), btn = $('#guessBtn');
  if (!wrap || !cv) return;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#101c33'; cx.fillRect(0, 0, cv.width, cv.height);
  if (!role) {
    wrap.style.display = 'none'; $('#guessInRow').style.display = 'none'; $('#guessWin').style.display = 'none';
    btn.style.display = ''; btn.textContent = '✏️ Mulai menggambar';
    st.textContent = 'gambar sesuatu — dia nebak!';
    return;
  }
  wrap.style.display = '';
  if (role === 'draw') {
    st.textContent = `gambar sesuatu — ${pname()} nebak live!`;
    $('#guessInRow').style.display = 'none'; $('#guessWin').style.display = '';
    btn.style.display = 'none';
    cx.strokeStyle = '#fff'; cx.lineWidth = 4; cx.lineCap = cx.lineJoin = 'round';
    let drawing = false, lx = 0, ly = 0;
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.onpointerdown = e => { drawing = true; [lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); };
    cv.onpointermove = e => {
      if (!drawing) return;
      const [x, y] = pos(e);
      cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(x, y); cx.stroke();
      socket.emit('guess:stroke', { x0: lx, y0: ly, x1: x, y1: y, c: '#fff' });
      [lx, ly] = [x, y];
    };
    cv.onpointerup = cv.onpointercancel = () => drawing = false;
    $('#guessWin').onclick = () => socket.emit('guess:correct');
  } else {
    st.textContent = `${pname()} lagi gambar — tebak apa!`;
    $('#guessInRow').style.display = ''; $('#guessWin').style.display = 'none';
    btn.style.display = 'none';
    cv.onpointerdown = cv.onpointermove = cv.onpointerup = null;
    const send = () => { const t = $('#guessIn').value.trim(); if (t) { socket.emit('guess:try', { text: t }); $('#guessIn').value = ''; } };
    $('#guessGo').onclick = send;
    $('#guessIn').onkeydown = e => { if (e.key === 'Enter') send(); };
  }
}

// ---------- DOODLE ----------
function setupDoodle() {
  const cv = $('#doodle'); if (!cv) return;
  const cx = cv.getContext('2d');
  const clear = () => { cx.fillStyle = '#101c33'; cx.fillRect(0, 0, cv.width, cv.height); };
  clear();
  cx.lineCap = cx.lineJoin = 'round'; cx.lineWidth = 4;
  let color = '#ffffff', drawing = false, lx = 0, ly = 0;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
  cv.onpointerdown = e => { drawing = true;[lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => {
    if (!drawing) return;
    const [x, y] = pos(e);
    cx.strokeStyle = color; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(x, y); cx.stroke();
    [lx, ly] = [x, y];
  };
  cv.onpointerup = cv.onpointercancel = () => drawing = false;
  $$('.pen').forEach(b => b.onclick = () => { color = b.dataset.c; $$('.pen').forEach(x => x.classList.toggle('on', x === b)); });
  $('#doodClear').onclick = clear;
  $('#doodSend').onclick = async () => {
    const r = await api('/memory', { method: 'POST', body: { img: cv.toDataURL('image/jpeg', .82), caption: '🎨 doodle' } });
    toast(r.ok ? `Doodle terkirim ke ${pname()} 🎨` : 'gagal kirim');
    if (r.ok) clear();
  };
}

// ---------- PHONE MAP ----------
let pinLayer = null;
async function loadPins() {
  if (!map) return;
  const pins = await api('/pins'); if (!pins) return;
  pinLayer?.remove(); pinLayer = null;
  const chipsEl = $('#pinChips');
  if (chipsEl) {
    chipsEl.innerHTML = pins.length
      ? pins.map(p => `<button class="pinchip" data-lat="${p.lat}" data-lng="${p.lng}">📌 ${esc(p.name)}<i>${p.mine ? 'kamu' : esc(p.by_name)}</i></button>`).join('')
      : `<span class="pinhint">📌 tandai tempat favorit kalian lewat tombol di atas</span>`;
    chipsEl.querySelectorAll('.pinchip').forEach(c => c.onclick = () => { map.flyTo([+c.dataset.lat, +c.dataset.lng], 16); });
  }
  if (!pins.length) return;
  pinLayer = L.layerGroup(pins.map(p =>
    L.marker([p.lat, p.lng], { icon: mkIcon('#ff8fb1', '📌') })
      .bindTooltip(`${esc(p.name)} · ${p.mine ? 'kamu' : esc(p.by_name)}`, { direction: 'top' })
  )).addTo(map);
}
function initMap() {
  if (typeof L === 'undefined') { $('#view').innerHTML = '<div class="muted" style="padding:40px">Peta gagal dimuat — cek koneksi internet</div>'; return; }
  map = L.map('map', { zoomControl: true }).setView([-6.2, 106.8], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  if (myLoc) { markers.me = L.marker([myLoc.lat, myLoc.lng], { icon: mkIcon('#4fd8c0', me.user.name[0].toUpperCase()) }).addTo(map); map.setView([myLoc.lat, myLoc.lng], 15); }
  api('/partner/location').then(d => { if (d?.lat != null) { partnerLoc = d; lastSync = Date.now(); updatePartnerMarkers(d); if (d.trail?.length) { trailLine?.remove(); trailLine = L.polyline(d.trail.map(t => [t.lat, t.lng]), { color: '#5cc8ff', weight: 3, opacity: .5, dashArray: '6 8' }).addTo(map); } } });
  loadPins();
}

// ---------- SCHEDULE ----------
async function loadSchedules() {
  schedCache = await api('/schedules');
  const now = Date.now();
  const until = (t) => { const m = Math.round((t - now) / 60000); if (m <= 0) return 'sekarang'; if (m < 60) return m + ' mnt lagi'; if (m < 1440) return Math.round(m / 60) + ' jam lagi'; return Math.round(m / 1440) + ' hari lagi'; };
  const tmr = new Date(now + 86400000);
  const dayLabel = (d) => d.toDateString() === new Date().toDateString() ? '📍 Hari ini' : d.toDateString() === tmr.toDateString() ? 'Besok' : d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
  const items = schedCache.map(s => ({ s, t: nextOcc(s) })).sort((a, b) => a.t - b.t);
  let html = '', lastDay = '';
  for (const { s, t } of items) {
    const d = new Date(t), dl = dayLabel(d);
    if (dl !== lastDay) { html += `<div class="dayh">${dl}</div>`; lastDay = dl; }
    const active = t <= now && (s.end_time || t + 3600000) > now;
    html += `<div class="item ${active ? 'now' : ''}">
      <div class="itemtime"><b>${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b><span>${s.repeat ? '🔁' : ''}</span></div>
      <div class="itembody"><div>${sicon(s.title)} ${esc(s.title)}</div><span class="chip ${active ? 'live' : ''}">${active ? '🔥 berlangsung sekarang' : '⏳ ' + until(t)}</span></div>
      <button class="del" data-id="${s.id}" title="Hapus">🗑</button></div>`;
  }
  $('#slist').innerHTML = html || `<div class="empty"><div>📅</div><b>Belum ada jadwal</b><p>Tambah jadwal bareng ${esc(pname())}</p></div>`;
  document.querySelectorAll('.del').forEach(b => b.onclick = async () => { await api('/schedules/' + b.dataset.id, { method: 'DELETE' }); schedCache = await api('/schedules'); loadSchedules(); });
}

async function addSchedule() {
  const title = $('#st').value.trim(), start = new Date($('#stime').value).getTime();
  if (!title) return toast('Isi judul jadwal dulu');
  if (!start || isNaN(start)) return toast('Pilih tanggal & jam dulu');
  const repeat = $('#srep')?.value || null;
  await api('/schedules', { method: 'POST', body: { title, start, notify: true, repeat } });
  if ($('#srep')) $('#srep').value = '';
  $('#st').value = '';
  schedCache = await api('/schedules');
  loadSchedules();
  toast('Jadwal ditambahkan 📅');
}

// ---------- CALENDAR VIEW ----------
let calDate = new Date();
function renderCal() {
  const el = $('#scal'); if (!el) return;
  const y = calDate.getFullYear(), m = calDate.getMonth();
  const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const withSched = new Set(schedCache.flatMap(s => {
    if (s.repeat === 'daily') return Array.from({ length: days }, (_, i) => i + 1);
    const d = new Date(nextOcc(s));
    if (s.repeat === 'weekly') { // tandai semua hari yang sama dalam bulan ini
      const out = [];
      for (let i = 1; i <= days; i++) if (new Date(y, m, i).getDay() === d.getDay()) out.push(i);
      return out;
    }
    return d.getFullYear() === y && d.getMonth() === m ? [d.getDate()] : [];
  }));
  let html = `<div class="calhead"><button id="calPrev" class="mini ghost">‹</button><b>${calDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</b><button id="calNext" class="mini ghost">›</button></div><div class="calgrid">`;
  for (const d of ['Mi','Se','Se','Ra','Ka','Ju','Sa']) html += `<div class="calwd">${d}</div>`;
  for (let i = 0; i < first; i++) html += '<div></div>';
  const today = new Date();
  for (let d = 1; d <= days; d++) {
    const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
    html += `<button class="calday ${isToday ? 'today' : ''} ${withSched.has(d) ? 'has' : ''}" data-d="${d}">${d}${withSched.has(d) ? '<i></i>' : ''}</button>`;
  }
  el.innerHTML = html + '</div>';
  el.querySelector('#calPrev').onclick = () => { calDate = new Date(y, m - 1, 1); renderCal(); };
  el.querySelector('#calNext').onclick = () => { calDate = new Date(y, m + 1, 1); renderCal(); };
  el.querySelectorAll('.calday').forEach(b => b.onclick = () => {
    const picked = new Date(y, m, +b.dataset.d, 12, 0);
    const dayScheds = schedCache.filter(s => new Date(s.start_time).toDateString() === picked.toDateString());
    if (dayScheds.length) { $('#segList').click(); $('#slist').scrollTop = 0; }
    else {
      $('#segList').click();
      const pad = n => String(n).padStart(2, '0');
      $('#stime').value = `${y}-${pad(m + 1)}-${pad(+b.dataset.d)}T19:00`;
      toast('Tanggal dipilih — isi judul lalu Tambah');
    }
  });
}

// ---------- BUCKET LIST ----------
async function loadBucket() {
  const el = $('#blist'); if (!el) return;
  const items = await api('/bucket');
  el.innerHTML = items.length ? items.map(b => `<div class="bitem ${b.done ? 'done' : ''}">
    <button class="bcheck" data-id="${b.id}">${b.done ? '✅' : '⬜'}</button><span>${esc(b.text)}</span>
    <button class="bdel" data-id="${b.id}">×</button></div>`).join('')
    : '<div class="hsub" style="padding:6px 2px">Belum ada impian — tulis yang pertama 🪣</div>';
  el.querySelectorAll('.bcheck').forEach(b => b.onclick = async () => { await api(`/bucket/${b.dataset.id}/toggle`, { method: 'POST' }); loadBucket(); });
  el.querySelectorAll('.bdel').forEach(b => b.onclick = async () => { await api('/bucket/' + b.dataset.id, { method: 'DELETE' }); loadBucket(); });
}
async function addBucket() {
  const t = $('#bucketIn').value.trim(); if (!t) return;
  await api('/bucket', { method: 'POST', body: { text: t } });
  $('#bucketIn').value = ''; loadBucket();
}

async function checkReminders() {
  if (!schedCache.length) schedCache = await api('/schedules');
  refreshMissStat();
  for (const s of schedCache) {
    if (!s.notify) continue;
    const diff = nextOcc(s) - Date.now();
    const key5 = s.id + ':5', key0 = s.id + ':0';
    // 5 menit sebelum — heads-up
    if (!reminded.has(key5) && diff > 60000 && diff < 5.5 * 60000) {
      reminded.add(key5);
      try { new Notification('⏰ ' + s.title, { body: '5 menit lagi — siap-siap ya!' }); } catch {}
      toast(`⏰ ${s.title} — 5 menit lagi`);
      navigator.vibrate?.(150);
    }
    // pas mulai — bestie ngingetin dengan suara
    if (!reminded.has(key0) && Math.abs(diff) < 60000) {
      reminded.add(key0);
      localStorage.cw_reminded = JSON.stringify([...reminded].slice(-100));
      navigator.vibrate?.([300, 100, 300]);
      try { new Notification('⏰ ' + s.title, { body: 'Jadwal kalian mulai sekarang!' }); } catch {}
      try { speak(`Waktunya ${s.title} nih, gas!`); } catch {}
    }
  }
}

// ---------- AI ----------
let chatMsgs = [];
const msgTime = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const msgRow = (m) => `
  <div class="mrow ${m.role}">
    ${m.role === 'ai' ? '<div class="mavatar">✦</div>' : ''}
    <div class="mgroup">
      <div class="msg ${m.role}">${m.typing ? '<span class="dots"><i></i><i></i><i></i></span>' : esc(m.text)}</div>
      <div class="mtime">${m.typing ? esc(aiName()) + ' mengetik…' : msgTime(m.ts)}</div>
    </div>
  </div>`;
function renderMsgs() {
  const box = $('#msgs'); if (!box) return;
  box.innerHTML = chatMsgs.map(msgRow).join('');
  box.scrollTop = 1e9;
}
async function sendChat() {
  const inp = $('#cin'), text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  chatMsgs.push({ role: 'me', text, ts: Date.now() }, { role: 'ai', text: '', ts: Date.now(), typing: true });
  renderMsgs();
  let reply;
  try { const d = await api('/ai/chat', { method: 'POST', body: { message: text } }); reply = d.reply || '…'; }
  catch { reply = 'Hmm, aku lagi susah dihubungin nih 😅 coba lagi ya.'; }
  const i = chatMsgs.findIndex(m => m.typing);
  if (i >= 0) chatMsgs.splice(i, 1, { role: 'ai', text: reply, ts: Date.now() });
  renderMsgs();
  if (me.user.ai_enabled) speak(reply, () => {
    // voice mode: abis jawab → mic nyala lagi buat lanjut ngobrol
    if (voiceMode && currentTab === 'ai') {
      try { aiRec?.start(); $('#micBtn')?.classList.add('rec'); } catch {}
    }
  });
}

let voiceMode = false, aiRec = null;
function setupMic(btnSel, inputSel) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $(btnSel);
  if (!SR) { btn.disabled = true; return; }
  const rec = new SR(); rec.lang = 'id-ID'; rec.interimResults = false;
  aiRec = rec;
  btn.onclick = () => { btn.classList.add('rec'); try { rec.start(); } catch {} };
  rec.onresult = (e) => { $(inputSel).value = e.results[0][0].transcript; sendChat(); };
  rec.onend = rec.onerror = () => btn.classList.remove('rec');
}

// ---------- PROFIL AI (nama, cowo/cewe, suara) ----------
function aiProfile() {
  if ($('.settings')) return;
  const el = document.createElement('div'); el.className = 'settings card';
  el.innerHTML = `<h3>✦ Profil bestie</h3>
    <div class="muted" style="text-align:left;font-size:12px">Namanya:</div>
    <input id="ainame" placeholder="Kasih nama (contoh: Bintang)" maxlength="20" value="${esc(me.user.ai_name || '')}">
    <div class="muted" style="text-align:left;font-size:12px">Dia seorang:</div>
    <div class="moodrow">
      <button class="mood ${me.user.ai_gender !== 'cowo' ? 'on' : ''}" data-g="cewe" style="width:auto;padding:0 16px">🙋‍♀️ Cewe</button>
      <button class="mood ${me.user.ai_gender === 'cowo' ? 'on' : ''}" data-g="cowo" style="width:auto;padding:0 16px">🙋‍♂️ Cowo</button>
    </div>
    <div class="muted" style="text-align:left;font-size:12px">Suaranya:</div>
    <select id="voiceSel"></select>
    <button id="testV" class="ghost">🔊 Coba suaranya</button>
    <button id="saveP">Simpan</button>
    <button id="cls3" class="ghost">Tutup</button>`;
  $('#view').appendChild(el);
  el.querySelector('#cls3').onclick = () => el.remove();
  let gender = me.user.ai_gender || 'cewe';
  el.querySelectorAll('.mood').forEach(b => b.onclick = () => {
    gender = b.dataset.g;
    el.querySelectorAll('.mood').forEach(x => x.classList.toggle('on', x === b));
    localStorage.cw_pitch = VOICE_PITCH[gender];
    delete localStorage.cw_voice;
    fillVoices();
  });
  const sel = el.querySelector('#voiceSel');
  const voices = () => (window.speechSynthesis?.getVoices() || []).sort((a, b) => a.lang.startsWith('id') ? -1 : b.lang.startsWith('id') ? 1 : 0);
  const vtag = (v) => MALE_V.test(v.name) ? '♂' : FEMALE_V.test(v.name) ? '♀' : '·';
  const fillVoices = () => { sel.innerHTML = voices().map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === localStorage.cw_voice ? 'selected' : ''}>${vtag(v)} ${esc(v.name)} (${esc(v.lang)})</option>`).join('') || '<option value="">Suara bawaan</option>'; };
  fillVoices(); speechSynthesis?.addEventListener?.('voiceschanged', fillVoices);
  sel.onchange = () => { localStorage.cw_voice = sel.value; };
  el.querySelector('#testV').onclick = () => speak('Hai! Aku ' + ($('#ainame').value.trim() || 'teman barumu') + '. Suaraku gini, santai kan?');
  el.querySelector('#saveP').onclick = async () => {
    const name = $('#ainame').value.trim();
    await api('/ai/prefs', { method: 'POST', body: { name: name || null, gender } });
    me.user.ai_name = name || null; me.user.ai_gender = gender;
    localStorage.cw_pitch = gender === 'cowo' ? VOICE_PITCH.cowo : VOICE_PITCH.cewe;
    toast('Profil bestie disimpan ✦'); el.remove(); show('ai');
  };
}

const VOICE_PITCH = { cowo: 0.6, cewe: 1.2 };
const MALE_V = /ardi|male|bima|jovan|dimas|andika|prabowo|damar|putra|laki|david|mark|james|daniel|george|guy|fred|alex|ravi|hemant|ryan|guy |christopher|eric|brandon|adam|andrew|brian|christian/i;
const FEMALE_V = /gadis|female|damayanti|siti|indah|intan|ayu|putri|perempuan|wanita|zira|aria|jenny|sonia|natasha|hazel|susan|michelle|ana|aria|catherine|clara|emma|jenny|libby|linda|maria|nancy|nova|sara|sonia|susan|tracy/i;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  const saved = vs.find(x => x.voiceURI === localStorage.cw_voice);
  if (saved) return saved;
  const idVs = vs.filter(v => v.lang.toLowerCase().startsWith('id'));
  const pool = idVs.length ? idVs : vs;
  const gender = me?.user?.ai_gender || 'cewe';
  const byGender = pool.find(v => (gender === 'cowo' ? MALE_V : FEMALE_V).test(v.name));
  return byGender || pool[0];
}
let ttsAudio = null;
function speak(text, onend) {
  const clean = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/[*_`~#]/g, '')
    .replace(/\s{2,}/g, ' ').trim();
  if (!clean) return onend?.();
  try { speechSynthesis?.cancel(); } catch {}
  ttsAudio?.pause(); ttsAudio = null;
  const g = me?.user?.ai_gender || 'cewe';
  fetch('/api/tts?g=' + g + '&t=' + encodeURIComponent(clean.slice(0, 380)), { headers: { 'x-token': localStorage.cw_token } })
    .then(async r => {
      if (!r.ok) return speakBrowser(clean, onend);
      const a = new Audio(URL.createObjectURL(await r.blob()));
      ttsAudio = a;
      let called = false;
      const done = () => { if (called) return; called = true; URL.revokeObjectURL(a.src); if (ttsAudio === a) ttsAudio = null; onend?.(); };
      a.onended = done;
      a.onerror = () => speakBrowser(clean, onend);
      a.play().catch(() => speakBrowser(clean, onend));
    })
    .catch(() => speakBrowser(clean, onend));
}
function speakBrowser(clean, onend) {
  try {
    if (!window.speechSynthesis) { onend?.(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean); u.lang = 'id-ID';
    const v = pickVoice();
    if (v) u.voice = v;
    u.pitch = +(localStorage.cw_pitch || VOICE_PITCH[me?.user?.ai_gender] || VOICE_PITCH.cewe);
    u.rate = +(localStorage.cw_rate || 0.98);
    u.volume = 1;
    let called = false;
    const done = () => { if (called) return; called = true; onend?.(); };
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
    setTimeout(done, 20000); // safety: jangan stuck kalau onend nggak ke-call
  } catch { onend?.(); }
}


// ---------- VOICE NOTES ----------
let vrec = null, vchunks = [], vstart = 0, vtimer = null;
function setupVoice() {
  const btn = $('#vrec'), st = $('#vstate');
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      vrec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); vchunks = []; vstart = Date.now();
      vrec.ondataavailable = e => vchunks.push(e.data);
      vrec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const dur = (Date.now() - vstart) / 1000;
        if (dur < 0.5) { st.textContent = 'terlalu pendek — tahan lebih lama'; return; }
        const blob = new Blob(vchunks, { type: vrec.mimeType || 'audio/mp4' });
        const reader = new FileReader();
        reader.onload = async () => {
          const r = await api('/voice', { method: 'POST', body: { audio: reader.result, dur } });
          st.textContent = r.ok ? `Terkirim ke ${pname()} 🎤` : (r.error || 'gagal kirim');
          if (r.ok) loadVoices();
        };
        reader.readAsDataURL(blob);
      };
      vrec.start();
      btn.classList.add('on'); st.textContent = '🔴 merekam… lepas buat kirim';
      vtimer = setTimeout(() => { if (vrec?.state === 'recording') vrec.stop(); }, 30000);
    } catch { st.textContent = 'butuh izin mikrofon 🎤'; }
  };
  const stop = () => { clearTimeout(vtimer); if (vrec?.state === 'recording') vrec.stop(); btn.classList.remove('on'); st.textContent = 'mengirim…'; };
  btn.onpointerdown = start; btn.onpointerup = stop; btn.onpointerleave = () => { if (vrec?.state === 'recording') stop(); }; btn.onpointercancel = stop;
}

async function loadVoices() {
  const list = await api('/voices');
  const el = $('#vlist'); if (!el) return;
  el.innerHTML = list.length ? list.map(v => `<div class="vrow">
    <button class="vplay" data-id="${v.id}">▶</button>
    <span class="vinfo"><b>${v.mine ? 'Kamu' : esc(v.from_name || '?')}</b> · ${v.dur}s · ${agoText(v.ts)}</span>
    ${v.mine ? `<button class="vdel" data-id="${v.id}">×</button>` : ''}
  </div>`).join('') : '<div class="muted">belum ada pesan suara</div>';
  el.querySelectorAll('.vplay').forEach(b => b.onclick = () => {
    const v = list.find(x => x.id === b.dataset.id);
    if (v) { b.textContent = '⏸'; const a = new Audio(v.audio); a.onended = () => b.textContent = '▶'; a.play(); }
  });
  el.querySelectorAll('.vdel').forEach(b => b.onclick = async () => { await api('/voice/' + b.dataset.id, { method: 'DELETE' }); loadVoices(); });
}

// ---------- WRAPPED ----------
async function wrappedModal(period) {
  const [w, act] = await Promise.all([api('/wrapped' + (period ? '?period=' + period : '')), api('/activity')]);
  if (!w || w.error) return toast('gagal load rekap');
  const el = document.createElement('div'); el.className = 'wmodal';
  el.innerHTML = `<div class="wcard">
    <div class="wlogo">🌊 Ryora</div>
    <div class="wmonth">${w.month}</div>
    <div class="wnames">${esc(w.me)} 💙 ${esc(w.partner || '?')}</div>
    <div class="wgrid">
      <div><b>${w.miss}</b><span>💓 kangen</span></div>
      <div><b>${w.memories}</b><span>🖼️ kenangan</span></div>
      <div><b>${w.photos}</b><span>📸 foto</span></div>
      <div><b>${w.voices}</b><span>🎤 suara</span></div>
      <div><b>${w.schedules}</b><span>📅 jadwal</span></div>
      <div><b>${w.answers}</b><span>❓ jawaban</span></div>
    </div>
    <div class="wfoot">hari ke-${w.days} bareng · ${w.miss_me}x kamu kangen · ${w.miss_them}x dia kangen</div>
    <div class="hmap" id="hmap"></div>
    <button id="wshare" class="ghost" style="margin-top:12px">📤 Simpan sebagai gambar</button>
    <button id="wclose" class="ghost" style="margin-top:8px">Tutup</button>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#wclose').onclick = () => el.remove();
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.querySelector('#wshare').onclick = () => {
    const c = document.createElement('canvas'); c.width = 540; c.height = 960;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 960);
    g.addColorStop(0, '#10406e'); g.addColorStop(.55, '#0a2450'); g.addColorStop(1, '#06122a');
    x.fillStyle = g; x.fillRect(0, 0, 540, 960);
    x.textAlign = 'center';
    x.fillStyle = '#5cc8ff'; x.font = '600 26px sans-serif';
    x.fillText('🌊 Ryora', 270, 100);
    x.fillStyle = '#fff'; x.font = '700 48px sans-serif';
    x.fillText(w.month, 270, 165);
    x.font = '400 25px sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillText(`${w.me} 💙 ${w.partner || '?'}`, 270, 212);
    const stats = [[w.miss, 'kangen'], [w.memories, 'kenangan'], [w.photos, 'foto'], [w.voices, 'suara'], [w.schedules, 'jadwal'], [w.answers, 'jawaban']];
    stats.forEach((s, i) => {
      const col = i % 3, row = Math.floor(i / 3), sx = 110 + col * 160, sy = 330 + row * 145;
      x.fillStyle = 'rgba(255,255,255,.07)';
      x.beginPath(); x.roundRect(sx - 62, sy - 62, 124, 124, 18); x.fill();
      x.fillStyle = '#fff'; x.font = '700 46px sans-serif';
      x.fillText(String(s[0]), sx, sy + 2);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '400 19px sans-serif';
      x.fillText(s[1], sx, sy + 36);
    });
    x.fillStyle = 'rgba(255,255,255,.65)'; x.font = '400 21px sans-serif';
    x.fillText(`hari ke-${w.days} bareng · ${w.miss_me}x ${w.me} kangen · ${w.miss_them}x ${w.partner || '?'} kangen`, 270, 830);
    x.fillStyle = 'rgba(92,200,255,.5)'; x.font = '400 16px sans-serif';
    x.fillText('dibuat dengan 💙 di Ryora Watch', 270, 890);
    const a = document.createElement('a');
    a.download = `ryora-${w.month.replace(/\s/g, '-').toLowerCase()}.png`;
    a.href = c.toDataURL('image/png'); a.click();
    toast('Rekap tersimpan sebagai gambar 📤');
  };
  // heatmap 6 minggu terakhir (kayak GitHub)
  const hm = el.querySelector('#hmap');
  if (hm && act?.days) {
    const cells = [];
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - today.getDay() - 35); // mulai Senin 5 minggu lalu
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const n = act.days[d.toDateString()] || 0;
      const lvl = n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 10 ? 3 : 4;
      cells.push(`<i class="heat${d > today ? ' off' : ' lv' + lvl}" title="${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}: ${n} aktivitas"></i>`);
    }
    hm.innerHTML = cells.join('') + '<span>interaksi kalian 6 minggu terakhir</span>';
  }
}

// ---------- SURAT CINTA ----------
async function loadLetters() {
  const list = await api('/letters');
  const el = $('#llist'); if (!el) return;
  el.innerHTML = list.length ? list.map(l => `<div class="lrow" data-id="${l.id}">
    <span class="licon">💌</span><div class="linfo"><b>${esc(l.title || 'Surat untukmu')}</b><span>${l.mine ? 'Kamu' : esc(l.from_name)} · ${agoText(l.ts)}</span></div>
    ${l.mine ? `<button class="ldel" data-id="${l.id}">×</button>` : ''}</div>`).join('')
    : '<div class="muted" style="font-size:12px">belum ada surat — tulis yang pertama 💌</div>';
  el.querySelectorAll('.lrow').forEach(r => r.onclick = e => {
    if (e.target.classList.contains('ldel')) return;
    const l = list.find(x => x.id === r.dataset.id);
    if (l) letterRead(l);
  });
  el.querySelectorAll('.ldel').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    await api('/letter/' + b.dataset.id, { method: 'DELETE' }); loadLetters();
  });
}
function letterRead(l) {
  const el = document.createElement('div'); el.className = 'wmodal';
  el.innerHTML = `<div class="lettercard">
    <div class="lhead">💌</div>
    <h3>${esc(l.title || 'Surat untukmu')}</h3>
    <div class="lmeta">${l.mine ? 'dari Kamu' : 'dari ' + esc(l.from_name)} · ${new Date(l.ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="lbody">${esc(l.text)}</div>
    <button id="lrclose" class="ghost">Tutup</button></div>`;
  document.body.appendChild(el);
  el.querySelector('#lrclose').onclick = () => el.remove();
  el.onclick = e => { if (e.target === el) el.remove(); };
}
function letterWrite() {
  const el = document.createElement('div'); el.className = 'wmodal';
  el.innerHTML = `<div class="lettercard">
    <div class="lhead">✍️</div>
    <input id="ltitle" placeholder="Judul surat (opsional)" maxlength="60">
    <textarea id="ltext" placeholder="Tulis perasaanmu di sini… panjang boleh, dia cuma kamu yang baca 💕" maxlength="4000" rows="8"></textarea>
    <button id="lsend">Kirim surat 💌</button>
    <button id="lcancel" class="ghost">Batal</button></div>`;
  document.body.appendChild(el);
  el.querySelector('#lcancel').onclick = () => el.remove();
  el.onclick = e => { if (e.target === el) el.remove(); };
  el.querySelector('#lsend').onclick = async () => {
    const text = el.querySelector('#ltext').value.trim();
    if (!text) return toast('Tulis sesuatu dulu ya');
    const r = await api('/letter', { method: 'POST', body: { title: el.querySelector('#ltitle').value.trim(), text } });
    if (r.ok) { toast(`Surat terkirim ke ${pname()} 💌`); el.remove(); loadLetters(); }
    else toast('gagal kirim');
  };
}

// ---------- SETTINGS ----------
const AVATARS = ['😺','🐰','🦊','🐻','🐼','🐨','🦋','🌸','🌙','⭐','💫','👑','🐯','🐶','🦄','🐥'];
function settings() {
  if ($('.settings')) return;
  const el = document.createElement('div'); el.className = 'settings card';
  el.innerHTML = `<h3>⚙️ Pengaturan</h3>
    <div class="ssect"><b>👤 Profil kamu</b>
      <div class="avrow">
        <span class="avatar big" id="myAv">${esc(av(me.user))}</span>
        <div class="avgrid">${AVATARS.map(a => `<button class="avpick ${me.user.avatar === a ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}</div>
      </div>
      <div class="hqin"><input id="nameIn" placeholder="Nama kamu" maxlength="30" value="${esc(me.user.name)}"><button id="nameBtn" class="mini">Simpan</button></div>
      <div class="hqin"><input id="statusIn" placeholder="Status kamu (misal: lagi sibuk 💼)" maxlength="40" value="${esc(me.user.status || '')}"><button id="statusBtn" class="mini">Simpan</button></div>
      <div class="hqin"><input id="bdayIn" type="date" value="${me.user.bday || ''}"><button id="bdayBtn" class="mini">🎂</button></div>
      <div class="hsub" style="margin-top:-6px">↑ tanggal lahirmu — dia bakal diingetin pas ultahmu deket</div>
      <div class="muted" style="text-align:left;font-size:12px">Mood kamu:</div>
      <div class="moodrow">${['😊','🥰','😴','🥺','😤','🤒','🔥','🎉'].map(e => `<button class="mood ${me.user.mood === e ? 'on' : ''}" data-m="${e}">${e}</button>`).join('')}</div>
      <div class="hsub" style="margin-top:4px">🔕 jam tenang — kangen & ping ditahan (misal 23 → 7):</div>
      <div class="hqin">
        <select id="dndF" style="flex:1"><option value="" ${me.user.dnd_from == null ? 'selected' : ''}>— dari</option>${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${me.user.dnd_from === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}</select>
        <span style="align-self:center">→</span>
        <select id="dndT" style="flex:1"><option value="" ${me.user.dnd_to == null ? 'selected' : ''}>— sampai</option>${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${me.user.dnd_to === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}</select>
        <button id="dndBtn" class="mini">🔕</button>
      </div>
    </div>
    <div class="ssect"><b>✦ Bestie AI</b>
      <button id="aipSet" class="ghost">✦ Profil bestie (${esc(me.user.ai_name || 'belum dinamai')})</button>
    </div>
    <div class="ssect"><b>💕 Tanggal jadian</b>
      <div class="muted" style="font-size:11px">dasar hitungan "hari ke-N" & monthsary</div>
      <div class="hqin"><input id="sinceIn" type="date" max="${new Date().toISOString().slice(0, 10)}" value="${new Date(sinceTs()).toISOString().slice(0, 10)}"><button id="sinceBtn" class="mini">💕 Simpan</button></div>
    </div>
    <button id="cls" class="ghost">Tutup</button>`;
  $('#view').appendChild(el);
  el.querySelector('#cls').onclick = () => el.remove();
  el.querySelectorAll('.mood').forEach(b => b.onclick = async () => {
    me.user.mood = b.dataset.m;
    el.querySelectorAll('.mood').forEach(x => x.classList.toggle('on', x === b));
    await api('/mood', { method: 'POST', body: { mood: b.dataset.m } });
    toast(`Mood kamu: ${b.dataset.m}`);
  });
  el.querySelector('#statusBtn').onclick = async () => {
    const t = el.querySelector('#statusIn').value.trim();
    me.user.status = t;
    await api('/status', { method: 'POST', body: { text: t } });
    toast(t ? `Status: "${t}"` : 'Status dihapus');
  };
  el.querySelectorAll('.avpick').forEach(b => b.onclick = async () => {
    me.user.avatar = b.dataset.a;
    $('#myAv').textContent = b.dataset.a;
    el.querySelectorAll('.avpick').forEach(x => x.classList.toggle('on', x === b));
    await api('/profile', { method: 'POST', body: { avatar: b.dataset.a } });
    toast(`Avatar: ${b.dataset.a}`);
  });
  el.querySelector('#nameBtn').onclick = async () => {
    const t = el.querySelector('#nameIn').value.trim(); if (!t) return toast('Nama kosong');
    me.user.name = t;
    await api('/profile', { method: 'POST', body: { name: t } });
    toast('Nama disimpan ✨');
  };
  el.querySelector('#dndBtn').onclick = async () => {
    const f = el.querySelector('#dndF').value, t = el.querySelector('#dndT').value;
    me.user.dnd_from = f === '' ? null : +f; me.user.dnd_to = t === '' ? null : +t;
    await api('/profile', { method: 'POST', body: { dnd_from: me.user.dnd_from, dnd_to: me.user.dnd_to } });
    toast(me.user.dnd_from == null ? 'Jam tenang dimatikan' : `🔕 Jam tenang: ${String(me.user.dnd_from).padStart(2, '0')}:00 → ${String(me.user.dnd_to).padStart(2, '0')}:00`);
  };
  el.querySelector('#bdayBtn').onclick = async () => {
    const dv = el.querySelector('#bdayIn').value; if (!dv) return;
    me.user.bday = dv;
    await api('/profile', { method: 'POST', body: { bday: dv } });
    toast(`Ultahmu: ${new Date(dv + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })} 🎂`);
  };
  el.querySelector('#sinceBtn').onclick = async () => {
    const dv = el.querySelector('#sinceIn').value; if (!dv) return;
    const ts = new Date(dv + 'T12:00:00').getTime();
    if (ts > Date.now()) return toast('Tanggal jadian nggak bisa di masa depan');
    const r = await api('/pair/since', { method: 'POST', body: { ts } });
    if (r.ok) { me.pair.since = ts; $('#daystat').textContent = `💕 hari ke-${daysTogether()}`; toast(`Jadian: ${new Date(ts).toLocaleDateString('id-ID')} — hari ke-${daysTogether()} 💕`); }
    else toast(r.error || 'gagal');
  };
  el.querySelector('#aipSet').onclick = () => { el.remove(); aiProfile(); };
}

async function missHistory() {
  $('.settings')?.remove();
  const list = await api('/miss/history');
  const el = document.createElement('div'); el.className = 'settings card';
  el.innerHTML = `<h3>💓 Riwayat kangen</h3><div class="histlist">` +
    (list.length ? list.map(e => {
      const isMe = e.from_user === me.user.id;
      const d = new Date(e.ts);
      return `<div class="histrow"><span class="hwho">${isMe ? 'Kamu' : esc(e.from_name || '?')}</span><span class="hpat">${'💓'.repeat(e.pattern)}</span><span class="hwhen">${agoText(e.ts)}</span></div>`;
    }).join('') : '<p class="muted">Belum ada riwayat — kirim 💓 ke pasanganmu.</p>') +
    `</div><button id="cls2" class="ghost">Tutup</button>`;
  $('#view').appendChild(el);
  el.querySelector('#cls2').onclick = () => el.remove();
}

// ---------- TOUR (first-run guide) ----------
function tour() {
  if (localStorage.cw_toured) return;
  const steps = [
    ['🌊', `Ryora Watch`, `Ruang berdua kamu & ${esc(pname())}. Semua yang kalian butuhin buat LDR ada di sini.`],
    ['🏠', 'Home', `Lihat status dia, jawab pertanyaan harian, kirim catatan kecil & foto. Feed aktivitas kalian juga ada di sini.`],
    ['💓', 'Kangen', `Cara bilang kangen TANPA ngetik: tap 💓, tahan sentuh bareng, adu suit, truth or dare, voice note, doodle, surat.`],
    ['🗺️', 'Peta & Jadwal', `Lokasi live dia (perlu izin GPS) + jadwal & kalender bareng, bucket list mimpi kalian.`],
    ['✦', `Bestie ${esc(me.user.ai_name || 'AI')}`, `Ngobrol apa aja — dia inget hal yang kamu ceritakan ("ingat ya aku suka…"). Bisa pakai suara 🎙️.`],
  ];
  let i = 0;
  const el = document.createElement('div'); el.className = 'tour';
  const draw = () => {
    const s = steps[i];
    el.innerHTML = `<div class="tourcard">
      <div class="tdots">${steps.map((_, j) => `<i class="${j === i ? 'on' : j < i ? 'done' : ''}"></i>`).join('')}</div>
      <div class="temoji">${s[0]}</div>
      <b>${s[1]}</b>
      <p>${s[2]}</p>
      <div class="tbtns">
        ${i < steps.length - 1 ? '<button id="tSkip" class="ghost">Lewati</button><button id="tNext">Lanjut →</button>' : '<button id="tDone" style="flex:1">Mulai 🌊</button>'}
      </div>
    </div>`;
    el.querySelector('#tNext') && (el.querySelector('#tNext').onclick = () => { i++; draw(); });
    el.querySelector('#tSkip') && (el.querySelector('#tSkip').onclick = close);
    el.querySelector('#tDone') && (el.querySelector('#tDone').onclick = close);
  };
  const close = () => { localStorage.cw_toured = '1'; el.remove(); };
  draw(); document.body.appendChild(el);
}

async function loadCapsules() {
  const box = $('#capList'); if (!box) return;
  const list = await api('/capsules').catch(() => []);
  if (!box.isConnected) return;
  box.innerHTML = (list || []).map(c => {
    const d = new Date(c.unlock_ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (c.locked && !c.mine) return `<div class="caprow lock">🔒 dari ${esc(c.from_name)} — kebuka ${d}</div>`;
    if (c.locked && c.mine) return `<div class="caprow lock">🎁 kamu — kebuka ${d} <b class="cdel" data-id="${c.id}">×</b></div>`;
    return `<div class="caprow"><b>🎉 dari ${esc(c.from_name)}:</b> ${esc(c.text)}${c.mine ? ` <b class="cdel" data-id="${c.id}">×</b>` : ''}</div>`;
  }).join('') || '';
  box.querySelectorAll('.cdel').forEach(x => x.onclick = async () => { await api('/capsule/' + x.dataset.id, { method: 'DELETE' }); loadCapsules(); });
}

// ---------- INIT ----------
if (localStorage.cw_theme) document.documentElement.dataset.theme = localStorage.cw_theme;
if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// viewport dinamis — keyboard iOS menyusutkan layar, input chat tetap kelihatan
const setVH = () => document.documentElement.style.setProperty('--vh', (window.visualViewport?.height || innerHeight) + 'px');
addEventListener('resize', setVH); window.visualViewport?.addEventListener('resize', setVH); setVH();

if (token) boot(); else authScreen();
