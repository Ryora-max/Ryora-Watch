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
let me = null, socket = null, map = null, wmini = null, markers = {}, trailLine = null, linkLine = null;
let currentTab = 'watch', watchTimer = null, remindTimer = null, tapCount = 0, tapTimer = null;
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
const updateTogether = () => {
  const el = $('#together');
  if (el) el.style.display = together() ? '' : 'none';
};
const mkIcon = (c, letter = '') => L.divIcon({ html: `<div style="width:20px;height:20px;background:${c};border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px ${c};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;font-family:sans-serif">${letter}</div>`, iconSize: [20, 20], iconAnchor: [10, 10], className: '' });

// ---------- AUTH ----------
function authScreen() {
  const urlCode = new URLSearchParams(location.search).get('join');
  app.innerHTML = `<div class="screen"><div class="logo">🌊</div><h1>Ryora Watch</h1>
  <div class="card"><input id="name" placeholder="Nama kamu" maxlength="30"><button id="go">Masuk</button>
  ${urlCode ? `<p class="muted">Kode undangan <b>${esc(urlCode)}</b> akan dipakai otomatis</p>` : ''}</div></div>`;
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
    <div class="who"><span class="avatar">${esc(me.partner.name[0].toUpperCase())}</span>
      <div class="whoinfo"><div class="pname">${esc(me.partner.name)}${me.partner.mood ? ' ' + me.partner.mood : ''} <span id="dot">⚪</span><span id="pbatt"></span><span id="together" class="tbadge" style="display:none">💚 bareng</span></div>
      <div class="muted" id="missStat"><span id="daystat">💕 hari ke-${daysTogether()}</span> · <span id="seen">…</span> <span id="pstatus" class="stag">${esc(me.partner.status || '')}</span></div></div>
    </div>
    <button id="gear" class="iconbtn">⚙️</button>
  </header>
  <div id="view"></div>
  <nav>
    <button data-t="home" class="on">🏠<span>Home</span></button>
    <button data-t="watch">⌚<span>Jam</span></button>
    <button data-t="map">🗺️<span>Peta</span></button>
    <button data-t="sched">📅<span>Jadwal</span></button>
    <button data-t="miss">💓<span>Kangen</span></button>
    <button data-t="ai">✦<span>AI</span></button>
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
  connectSocket(); show('home'); refreshMissStat(); shareBattery(); startGeo(); updateSeen(); updateTogether();
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
  socket.on('partner:status', ({ online, lastSeen }) => { partnerOnline = !!online; if (!online) partnerSeen = lastSeen || Date.now(); $('#dot').textContent = online ? '🟢' : '⚪'; const w = $('#wdot'); if (w) w.textContent = online ? '🟢' : '⚪'; updateSeen(); });
  socket.on('partner:battery', ({ level }) => { $('#pbatt').textContent = ` ${level}%`; const w = $('#wbatt'); if (w) w.textContent = `🔋${level}%`; });
  socket.on('schedules:changed', async () => {
    schedCache = await api('/schedules');
    refreshMissStat();
    if (currentTab === 'sched') loadSchedules();
    if (wmode === 'app' && $('#wappbody') && currentWApp === 0) renderWSched($('#wappbody'));
  });
  socket.on('location:update', (l) => { partnerLoc = l; lastSync = Date.now(); updatePartnerMarkers(l); trailLine?.addLatLng([l.lat, l.lng]); updateTogether(); });
  socket.on('miss:receive', ({ from, pattern }) => {
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
  socket.on('home:changed', () => { if (currentTab === 'home') renderHome($('#view')); });
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
    navigator.vibrate?.([200, 100, 200]);
    ding();
    const label = { makan: '🍚 "Udah makan belum?"', minum: '💧 "Minum air ya!"', peluk: '🤗 peluk virtual', tidur: '😴 "Istirahat dulu ya"' }[kind] || kind;
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('Ryora Watch', { body: `${from}: ${label}` }); } catch {}
    toast(`${from} — ${label}`, 4000);
  });
  socket.on('touch:partner', ({ on }) => {
    const el = $('#touchState'); if (el) el.textContent = on ? `${me.partner.name} juga nyentuh… 👀` : '';
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
  socket.on('partner:mood', ({ mood, uid }) => {
    if (uid === me.user.id) return;
    me.partner.mood = mood;
    const pn = $('.pname');
    if (pn) pn.innerHTML = `${esc(me.partner.name)}${mood ? ' ' + mood : ''} <span id="dot">${$('#dot')?.textContent || '⚪'}</span><span id="pbatt">${$('#pbatt')?.textContent || ''}</span><span id="together" class="tbadge" style="display:${together() ? '' : 'none'}">💚 bareng</span>`;
    const wp = $('#wpmood'); if (wp) wp.textContent = mood || '';
    toast(`${me.partner.name} lagi ${mood}`);
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
  el.textContent = `💕 hari ke-${daysTogether()}${nxt ? ' · ' + nxt : ''}${s.sent || s.received ? ` · 💓 ↑${s.sent} ↓${s.received}` : ''}`;
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
  if (sc && suit) sc.textContent = (suit.me || suit.them || suit.draw) ? `skor: kamu ${suit.me} · ${me.partner.name} ${suit.them}${suit.draw ? ' · seri ' + suit.draw : ''}` : '';
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
let geoState = 'off'; // off | on | denied | unsupported
function startGeo() {
  if (!navigator.geolocation) { geoState = 'unsupported'; return; }
  navigator.permissions?.query({ name: 'geolocation' }).then(p => {
    if (p.state === 'denied') geoState = 'denied';
    p.onchange = () => { if (p.state === 'denied') { geoState = 'denied'; renderGeoCard(); } };
  }).catch(() => {});
  navigator.geolocation.watchPosition(p => {
    geoState = 'on'; renderGeoCard();
    myLoc = { lat: p.coords.latitude, lng: p.coords.longitude };
    socket?.emit('location:update', myLoc);
    for (const m of [map, wmini]) {
      if (!m) continue;
      const id = 'me' + (m === wmini ? 'w' : '');
      if (!markers[id]) { markers[id] = L.marker([myLoc.lat, myLoc.lng], { icon: mkIcon('#4fd8c0', me.user.name[0].toUpperCase()) }).addTo(m); if (m === map) m.setView([myLoc.lat, myLoc.lng], 15); }
      else markers[id].setLatLng([myLoc.lat, myLoc.lng]);
    }
    fitBoth(); updateTogether();
  }, e => { if (e.code === 1) { geoState = 'denied'; renderGeoCard(); } }, { enableHighAccuracy: true });
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
    : `📍 <b>Lokasi belum aktif</b><span>Biar ${esc(me.partner.name)} bisa lihat posisimu live</span><button id="geoGo" class="mini">Aktifkan lokasi</button>`;
  const g = $('#geoGo'); if (g) g.onclick = askGeo;
}

async function shareBattery() {
  try { const b = await navigator.getBattery(); const send = () => socket?.emit('battery:update', { level: Math.round(b.level * 100) }); send(); b.onlevelchange = send; } catch {}
}

function updatePartnerMarkers(l) {
  for (const m of [map, wmini]) {
    if (!m) continue;
    const id = 'p' + (m === wmini ? 'w' : '');
    if (!markers[id]) markers[id] = L.marker([l.lat, l.lng], { icon: mkIcon('#5cc8ff', me.partner.name[0].toUpperCase()) }).addTo(m);
    else markers[id].setLatLng([l.lat, l.lng]);
  }
  if (wmini) wmini.setView([l.lat, l.lng], wmini.getZoom());
  fitBoth();
  const lb = $('#locpanel');
  if (lb) lb.innerHTML = `<span class="avatar">${esc(me.partner.name[0].toUpperCase())}</span>
    <div class="locinfo"><b>${esc(me.partner.name)}</b><span>${distText() ? distText() + ' · ' : ''}${agoText(l.ts)}</span></div>
    <button id="locCenter" class="iconbtn">◎</button>`;
  const lc = $('#locCenter');
  if (lc) lc.onclick = () => map?.fitBounds(L.latLngBounds(markers.me?.getLatLng() || [l.lat, l.lng], markers.p?.getLatLng() || [l.lat, l.lng]).pad(0.3));
}

function fitBoth() {
  if (!map || !markers.me || !markers.p) return;
  map.fitBounds(L.latLngBounds(markers.me.getLatLng(), markers.p.getLatLng()).pad(0.3));
  linkLine?.remove();
  linkLine = L.polyline([markers.me.getLatLng(), markers.p.getLatLng()], { color: '#fff', weight: 3, opacity: .75, dashArray: '1 10', lineCap: 'round' }).addTo(map);
}

// ---------- TABS ----------
function show(tab) {
  currentTab = tab;
  clearInterval(watchTimer);
  try { map?.remove(); wmini?.remove(); } catch {}
  wmini = null; delete markers.mew; delete markers.pw;
  map = null; delete markers.me; delete markers.p; trailLine = null; linkLine = null;
  const v = $('#view');
  if (tab === 'home') return renderHome(v);
  if (tab === 'watch') return showWatch(v);
  if (tab === 'map') {
    v.innerHTML = `<div id="map"></div><div class="geocard" id="geoCard" style="display:none"></div><div class="locpanel" id="locpanel"><span class="avatar">${esc(me.partner.name[0].toUpperCase())}</span><div class="locinfo"><b>${esc(me.partner.name)}</b><span>menunggu lokasi…</span></div></div>`;
    initMap(); renderGeoCard(); return;
  }
  if (tab === 'miss') {
    v.innerHTML = `<div class="misspage">
      <div class="missttl">💓 Kangen</div>
      <button id="missBig"><span class="hb">💓</span><span id="tapN"></span></button>
      <div class="muted">tap berkali-kali buat sinyal lebih kuat (maks ×5)</div>
      <div class="missstats" id="missStats"></div>
      <div class="msect"><b>🤲 Sentuh bareng</b>
        <div class="muted" style="margin:2px 0 8px">tahan tombol — kalau dia juga tahan, kalian "nyentuh" 💞</div>
        <button id="touchBtn" class="touchbtn">✋ Tahan di sini</button>
        <div class="muted" id="touchState" style="margin-top:8px;min-height:18px"></div>
      </div>
      <div class="msect"><b>🤗 Pings sayang</b>
        <div class="caregrid">
          <button class="care" data-k="makan">🍚<span>Udah makan?</span></button>
          <button class="care" data-k="minum">💧<span>Minum air!</span></button>
          <button class="care" data-k="peluk">🤗<span>Peluk virtual</span></button>
          <button class="care" data-k="tidur">😴<span>Istirahat ya</span></button>
        </div>
      </div>
      <div class="msect"><b>✊ Adu suit</b>
        <div class="muted" style="margin:2px 0 8px">pilih barengan — hasilnya muncul di dua HP</div>
        <div class="suitrow">
          <button class="suit" data-h="✊">✊</button>
          <button class="suit" data-h="✋">✋</button>
          <button class="suit" data-h="✌️">✌️</button>
        </div>
        <div class="muted" id="suitState" style="margin-top:8px;min-height:18px"></div>
        <div class="muted" id="suitScore" style="font-size:11px"></div>
      </div>
      <div class="msect"><b>🎤 Pesan suara</b>
        <button id="vrec" class="touchbtn" style="border-color:#ff8fb1">🎙️ Tahan buat rekam (maks 30d)</button>
        <div class="muted" id="vstate" style="margin-top:6px;min-height:16px"></div>
        <div id="vlist" style="margin-top:6px"></div>
      </div>
      <div class="msect"><b>Riwayat</b><div class="histlist" id="missHist"></div></div>
    </div>`;
    $('#missBig').onclick = missTap;
    setupVoice();
    loadVoices();
    $$('.care').forEach(b => b.onclick = () => { socket.emit('care:send', { kind: b.dataset.k }); toast(`Terkirim ke ${me.partner.name} ${b.textContent.trim().slice(0, 2)}`); });
    const tb = $('#touchBtn');
    const tOn = () => { socket.emit('touch:start'); $('#touchState').textContent = `menunggu ${me.partner.name}…`; tb.classList.add('on'); };
    const tOff = () => { socket.emit('touch:end'); tb.classList.remove('on'); setTimeout(() => { const s = $('#touchState'); if (s && s.textContent.startsWith('menunggu')) s.textContent = ''; }, 600); };
    tb.onpointerdown = tOn; tb.onpointerup = tOff; tb.onpointerleave = tOff; tb.onpointercancel = tOff;
    $$('.suit').forEach(b => b.onclick = () => {
      suitMyPick = b.dataset.h;
      $$('.suit').forEach(x => x.classList.toggle('on', x === b));
      socket.emit('suit:pick', { hand: b.dataset.h });
      $('#suitState').textContent = suitWaiting ? '✨' : `kamu pilih ${b.dataset.h} — nunggu ${me.partner.name}…`;
    });
    return loadMissTab();
  }
  if (tab === 'sched') {
    v.innerHTML = `<div class="list">
      <div class="segtoggle"><button id="segList" class="on">📋 List</button><button id="segCal">📅 Kalender</button></div>
      <div class="addform"><input id="st" placeholder="Judul jadwal" maxlength="80"><input id="stime" type="datetime-local"><button id="sadd">Tambah</button></div>
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
      <button id="aiToggle" class="mini">${me.user.ai_enabled ? '🔊 ON' : '🔇 OFF'}</button></div>
      <div id="msgs"></div>
      <div id="chips"><button class="chip">Jadwal hari ini apa?</button><button class="chip">Dia di mana?</button><button class="chip">Cuaca sekarang gimana?</button><button class="chip">Lagi kangen nih</button></div>
      <div id="chatform"><button id="micBtn">🎤</button><input id="cin" placeholder="Tulis pesan…" maxlength="500"><button id="csend">➤</button></div></div>`;
    if (!chatMsgs.length) chatMsgs.push({ role: 'ai', text: `Hai ${me.user.name}! Aku ${aiName()} ✦ mau ngobrol apa? Tanya jadwal atau lokasi ${me.partner.name} juga bisa.`, ts: Date.now() });
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
    return setupMic('#micBtn', '#cin');
  }
}

// ---------- HOME / WIDGET DASHBOARD ----------
async function renderHome(v) {
  v.innerHTML = `<div class="home"><div class="hskel">memuat…</div></div>`;
  const d = await api('/home');
  if (!d || currentTab !== 'home' || !$('#view .home')) return;
  const p = me.partner;
  const next = schedCache.find(s => s.start_time > Date.now() - 60000);
  const answered = !!d.myAnswer, both = answered && !!d.theirAnswer;
  v.innerHTML = `<div class="home">
    <div class="hcard pcard">
      <span class="avatar big">${esc(p.name[0].toUpperCase())}</span>
      <div class="pinfo"><b>${esc(p.name)} ${p.mood || ''}</b>
        <span>${partnerOnline ? '🟢 online' : '⚪ ' + (partnerSeen ? 'aktif ' + agoText(partnerSeen) : 'offline')}${distText() ? ' · 📍 ' + distText() : ''}</span>
        <span id="hstatus" class="stag">${esc(p.status || '')}</span>
      </div>
      <div class="hdays">💕<b>${daysTogether()}</b><span>hari</span></div>
    </div>
    <div class="hchips">
      <div class="hchip">🔥 streak ${d.streak || 0} hari</div>
      <div class="hchip">🎂 ${nextMonthsary().months} bulan -${nextMonthsary().days} hari</div>
      ${next ? `<div class="hchip" id="hNext">⏰ ${new Date(next.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ${esc(next.title.slice(0, 12))}</div>` : '<div class="hchip" id="hNext">📅 tambah jadwal</div>'}
      <div class="hchip" id="hMiss">💓 kangen</div>
      <div class="hchip" id="hWrap2">📊 rekap</div>
      <div class="hchip" id="hWx">🌦️ cuaca…</div>
    </div>
    <div class="hcard">
      <div class="hlabel">❓ Pertanyaan hari ini</div>
      <div class="hq">${esc(d.q || '')}</div>
      ${!answered ? `<div class="hqin"><input id="hans" placeholder="Jawabanmu…" maxlength="200"><button id="hansBtn" class="mini">Kirim</button></div><div class="hsub">jawaban dia kebuka setelah kamu jawab</div>`
        : both ? `<div class="hans"><b>${esc(me.user.name)}:</b> ${esc(d.myAnswer)}</div><div class="hans theirs"><b>${esc(p.name)}:</b> ${esc(d.theirAnswer)}</div>` + reactRow('answer', d.answerReacts, todayKey())
        : `<div class="hans"><b>Kamu:</b> ${esc(d.myAnswer)}</div><div class="hsub">menunggu ${esc(p.name)} jawab… 🤫</div>`}
    </div>
    <div class="hcard">
      <div class="hlabel">📝 Catatan buat dia <span class="hsub">(tampil di home-nya)</span></div>
      ${d.theirNote ? `<div class="hnote">${esc(d.theirNote)}<span class="hfrom">— ${esc(p.name)}</span></div>` : ''}
      <div class="hqin"><input id="hnote" placeholder="Tulis catatan kecil…" maxlength="200" value="${esc(d.myNote || '')}"><button id="hnoteBtn" class="mini">💌</button></div>
    </div>
    <div class="hcard">
      <div class="hlabel">📸 Foto hari ini</div>
      <div class="hphotos" id="hphotos">` +
        (d.photos?.length ? d.photos.map(ph => `<div class="hphoto ${ph.mine ? '' : 'theirs'}"><img src="${ph.img}"><span>${ph.mine ? 'Kamu' : esc(p.name)}${ph.caption ? ' · ' + esc(ph.caption) : ''}</span>${ph.mine ? '' : reactRow('photo', ph.reacts, todayKey() + ':' + p.id)}</div>`).join('') : '<div class="hsub">belum ada foto — kirim momen harimu 📷</div>') +
      `</div>
      <label class="hphotobtn">📷 Kirim foto<input type="file" id="hfile" accept="image/*" hidden></label>
    </div>
    <div class="hcard" id="meetCard">
      <div class="hlabel">✈️ Countdown ketemu</div>
      ${me.pair.next_meet ? `<div class="meetbig">${(() => { const dd = Math.ceil((me.pair.next_meet - Date.now()) / 86400000); return dd > 0 ? `<b>${dd}</b> hari lagi — ${new Date(me.pair.next_meet).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })} 🎉` : 'HARI INI KETEMUAN! 🎉🎉'; })()}</div>` : '<div class="hsub">atur tanggal ketemu kalian berikutnya</div>'}
      <div class="hqin"><input id="meetDate" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${me.pair.next_meet ? new Date(me.pair.next_meet).toISOString().slice(0, 10) : ''}"><button id="meetBtn" class="mini">Simpan</button></div>
    </div>
    <div class="hcard">
      <div class="hlabel">🖼️ Kenangan <span class="hsub">(album kalian)</span></div>
      <div class="hphotos" id="hmems"></div>
      <div class="hqin"><label class="hphotobtn" style="flex:1;margin:0">📷 Tambah kenangan<input type="file" id="mfile" accept="image/*" hidden></label></div>
    </div>
    ${d.recap ? `<div class="hcard"><div class="hlabel">📊 Minggu ini</div>
      <div class="recap">
        <div><b>${d.recap.miss}</b><span>💓 kangen</span></div>
        <div><b>${d.recap.sched}</b><span>📅 jadwal</span></div>
        <div><b>${d.recap.photo}</b><span>📸 foto</span></div>
        <div><b>${d.recap.ans}</b><span>❓ jawaban</span></div>
      </div><button id="hWrap" class="ghost" style="margin-top:10px;font-size:13px">📊 Kartu rekap ${new Date().toLocaleDateString('id-ID', { month: 'long' })}</button></div>` : ''}
    ${d.feed?.length ? `<div class="hcard"><div class="hlabel">⚡ Aktivitas kalian</div>
      ${d.feed.map(f => `<div class="feedrow"><span class="fwho ${f.mine ? '' : 'them'}">${esc(f.mine ? 'Kamu' : f.who)}</span><span class="ftxt">${esc(f.text)}</span><span class="fwhen">${agoText(f.ts)}</span></div>`).join('')}
    </div>` : ''}
  </div>`;
  $('#hWrap') && ($('#hWrap').onclick = () => wrappedModal());
  $('#hWrap2') && ($('#hWrap2').onclick = () => wrappedModal());
  api('/weather').then(w => {
    const el2 = $('#hWx'); if (!el2 || !w) return;
    const wd = (x) => x ? (x.code >= 60 ? '🌧️' : x.code >= 50 ? '🌦️' : x.code >= 3 ? '☁️' : x.code ? '⛅' : '☀️') + x.t + '°' : null;
    const a = wd(w.me), b = wd(w.partner);
    el2.textContent = a && b ? `${a} kamu · ${b} dia` : a ? `${a} kamu` : b ? `${b} dia` : '';
    if (!a && !b) el2.style.display = 'none';
  }).catch(() => { const el2 = $('#hWx'); if (el2) el2.style.display = 'none'; });
  v.querySelectorAll('.hphoto img').forEach(img => { img.style.cursor = 'zoom-in'; img.onclick = () => photoViewer(img.src); });
  v.querySelectorAll('.hreact button').forEach(b => b.onclick = async () => {
    const row = b.closest('.hreact');
    const tid = row.dataset.tid || todayKey();
    const on = !b.classList.contains('on');
    await api('/react', { method: 'POST', body: { type: row.dataset.t, tid, emoji: on ? b.dataset.e : null } });
    renderHome(v);
  });
  $('#hNext').onclick = () => { document.querySelectorAll('nav button').forEach(x => x.classList.remove('on')); document.querySelector('[data-t="sched"]').classList.add('on'); show('sched'); };
  $('#hMiss').onclick = () => { document.querySelectorAll('nav button').forEach(x => x.classList.remove('on')); document.querySelector('[data-t="miss"]').classList.add('on'); show('miss'); };
  const ansBtn = $('#hansBtn');
  if (ansBtn) {
    const send = async () => { const t = $('#hans').value.trim(); if (!t) return; await api('/daily/answer', { method: 'POST', body: { text: t } }); renderHome(v); };
    ansBtn.onclick = send; $('#hans').onkeydown = e => { if (e.key === 'Enter') send(); };
  }
  $('#hnoteBtn').onclick = async () => {
    await api('/note', { method: 'POST', body: { text: $('#hnote').value.trim() } });
    toast('Catatan tersimpan 💌');
  };
  $('#meetBtn').onclick = async () => {
    const v2 = $('#meetDate').value; if (!v2) return;
    const ts = new Date(v2 + 'T12:00:00').getTime();
    await api('/meet', { method: 'POST', body: { ts } });
    me.pair.next_meet = ts; renderHome(v); toast('Tanggal ketemu disimpan ✈️');
  };
  api('/memories').then(mems => {
    const el = $('#hmems'); if (!el) return;
    el.innerHTML = mems.length ? mems.slice(0, 4).map(m => `<div class="hphoto"><img src="${m.img}"><span>${m.mine ? 'Kamu' : esc(m.from_name || '?')}${m.caption ? ' · ' + esc(m.caption) : ''}${m.mine ? `<b class="mdel" data-id="${m.id}">×</b>` : ''}</span></div>`).join('') + (mems.length > 4 ? `<div class="hphoto more"><span>+${mems.length - 4} lagi</span></div>` : '')
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
      const data = c.toDataURL('image/jpeg', .72);
      api('/photo', { method: 'POST', body: { img: data } }).then(r => {
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
  el.innerHTML = `<img src="${src}" style="max-width:94vw;max-height:86dvh;border-radius:14px;box-shadow:0 10px 60px rgba(0,0,0,.6)">`;
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}

// ---------- WATCH SIMULATOR (watchface → tap/crown → grid icon → app) ----------
let wmode = 'face';
const aiName = () => me?.user?.ai_name || 'AI';
function showWatch(v) {
  v.innerHTML = `
  <div class="watchwrap">
    <div class="strap top"></div>
    <div class="wbody">
      <div class="wscreen" id="wscreen">
        <div class="wlayer" id="wface"></div>
        <div class="wlayer" id="wgrid" hidden></div>
        <div class="wlayer" id="wapp" hidden></div>
      </div>
      <button class="crown" id="crown" title="Menu">◉</button>
    </div>
    <div class="strap bot"></div>
    <div class="wtools"><button class="mini ghost" id="wpaperBtn">🎨 Wallpaper</button><span class="muted" style="font-size:11px">tap layar / ◉ = menu</span></div>
  </div>`;
  $('#wpaperBtn').onclick = paperMenu;

  $('#wface').onclick = () => wMenu();
  $('#crown').onclick = () => wmode === 'face' ? wMenu() : wHome();

  wHome(); applyWPaper();
  watchTimer = setInterval(tickWatch, 1000); tickWatch();
}

const WAPPS = [
  { icon: '📅', name: 'Jadwal', open: () => renderWSched($('#wappbody')) },
  { icon: '🗺️', name: 'Peta', open: () => renderWMap($('#wappbody')) },
  { icon: '✦', name: 'AI', open: () => renderWAI($('#wappbody')) },
  { icon: '💓', name: 'Kangen', open: () => renderWKangen($('#wappbody')) },
  { icon: '😊', name: 'Mood', open: () => renderWMood($('#wappbody')) },
  { icon: '⚙️', name: 'Status', open: () => renderWStatus($('#wappbody')) },
];
const wLayer = (id) => {
  wmode = id === 'wface' ? 'face' : id === 'wgrid' ? 'grid' : 'app';
  for (const l of ['wface', 'wgrid', 'wapp']) { const el = $('#' + l); if (el) el.hidden = l !== id; }
};
function wHome() { wmini?.remove(); wmini = null; wLayer('wface'); renderWatchface(); }
function wMenu() {
  wLayer('wgrid');
  $('#wgrid').innerHTML = `<div class="wlaunch">` +
    WAPPS.map((a, i) => `<button class="wicon" data-i="${i}"><i>${a.icon}</i><span>${a.name}</span></button>`).join('') + `</div>`;
  $('#wgrid').querySelectorAll('.wicon').forEach(b => b.onclick = e => { e.stopPropagation(); openWApp(+b.dataset.i); });
  $('#wgrid').onclick = e => { if (e.target.id === 'wgrid' || e.target.className === 'wlaunch') wHome(); };
}
let currentWApp = -1;
function openWApp(i) {
  currentWApp = i;
  wLayer('wapp');
  $('#wapp').innerHTML = `<button class="wback" id="wback">‹</button><div class="wappbody" id="wappbody"></div>`;
  $('#wback').onclick = wMenu;
  WAPPS[i].open();
}

// ---------- WALLPAPER JAM (diatur dari app, seperti Galaxy Watch) ----------
const WPAPERS = [
  { name: 'Langit', css: 'linear-gradient(165deg,#5cc8ff,#1e6fb8)' },
  { name: 'Samudra', css: 'linear-gradient(165deg,#1e8fd4,#0a4a80)' },
  { name: 'Toska', css: 'linear-gradient(165deg,#2ed8c4,#0e7a80)' },
  { name: 'Senja', css: 'linear-gradient(165deg,#f0a05a,#8a3a6e)' },
  { name: 'Aurora', css: 'linear-gradient(165deg,#5eead4,#5a6ee8)' },
  { name: 'Ombak', css: 'linear-gradient(165deg,#38bdf8,#6366f1)' },
];
const applyWPaper = () => {
  const w = $('#wscreen') || $('.wscreen');
  if (!w) return;
  if (localStorage.cw_wpaper === 'custom' && localStorage.cw_wpaper_img) {
    w.style.background = `url(${localStorage.cw_wpaper_img}) center/cover no-repeat`;
    return;
  }
  const i = +(localStorage.cw_wpaper || 0);
  w.style.background = WPAPERS[i]?.css || WPAPERS[0].css;
};

function tickWatch() {
  const n = new Date(), t = $('#wtime');
  if (!t) return;
  t.textContent = n.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const ws = $('#wsec'); if (ws) ws.textContent = ':' + String(n.getSeconds()).padStart(2, '0');
  $('#wdate').textContent = n.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  const wl = $('#wloc');
  if (wl) wl.textContent = partnerLoc ? `📍 ${distText() || '—'} • ${agoText(partnerLoc.ts)}` : '📍 menunggu lokasi…';
  const wn = $('#wnext');
  if (wn) {
    const next = schedCache.find(s => s.start_time > Date.now() - 60000);
    wn.textContent = next ? `⏰ ${new Date(next.start_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ${next.title}` : '— tidak ada jadwal —';
  }
}

const daysTogether = () => Math.floor((Date.now() - me.pair.created_at) / 86400000) + 1;
const nextMonthsary = () => {
  const c = new Date(me.pair.created_at), n = new Date();
  let next = new Date(n.getFullYear(), n.getMonth(), c.getDate());
  if (next.getTime() <= n.getTime()) next = new Date(n.getFullYear(), n.getMonth() + 1, c.getDate());
  const elapsed = Math.max(0, (n.getFullYear() - c.getFullYear()) * 12 + (n.getMonth() - c.getMonth()) - (n.getDate() < c.getDate() ? 1 : 0));
  const months = elapsed + 1;
  return { days: Math.ceil((next - n) / 86400000), months };
};

function renderWatchface() {
  const el = $('#wface'); if (!el) return;
  el.innerHTML = `
    <div class="wdate" id="wdate"></div>
    <div class="wtime"><span id="wtime"></span><span class="wsec" id="wsec"></span></div>
    <div class="wpartner">${esc(me.partner.name)} <span id="wpmood">${me.partner.mood || ''}</span> <span id="wdot">⚪</span> <span id="wbatt">${me.partnerBattery != null ? '🔋' + me.partnerBattery + '%' : ''}</span></div>
    <div class="wlove">💕 hari ke-${daysTogether()}</div>
    <div class="wnext" id="wnext"></div>
    <div class="wloc" id="wloc"></div>
    <div class="whint">tap = menu</div>`;
}

function renderWSched(el) {
  const now = Date.now(), today = new Date().toDateString();
  const todays = schedCache.filter(s => new Date(s.start_time).toDateString() === today);
  el.innerHTML = `<div class="wsub">JADWAL HARI INI</div><div class="wlist">` +
    (todays.map(s => {
      const d = new Date(s.start_time), act = s.start_time <= now && (s.end_time || s.start_time + 3600000) > now;
      return `<div class="witem ${act ? 'now' : ''}"><b>${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b>${sicon(s.title)} ${esc(s.title)}</div>`;
    }).join('') || '<div class="wsub">kosong</div>') + `</div>`;
}

function renderWMap(el) {
  if (typeof L === 'undefined') { el.innerHTML = '<div class="wsub">peta gagal dimuat</div>'; return; }
  el.innerHTML = '<div class="wmap" id="wmap"></div>';
  wmini?.remove();
  wmini = L.map('wmap', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false }).setView([-6.2, 106.8], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(wmini);
  setTimeout(() => wmini.invalidateSize(), 300);
  if (myLoc) { markers.mew = L.marker([myLoc.lat, myLoc.lng], { icon: mkIcon('#4fd8c0', me.user.name[0].toUpperCase()) }).addTo(wmini); wmini.setView([myLoc.lat, myLoc.lng], 14); }
  if (partnerLoc) { markers.pw = L.marker([partnerLoc.lat, partnerLoc.lng], { icon: mkIcon('#5cc8ff', me.partner.name[0].toUpperCase()) }).addTo(wmini); if (!myLoc) wmini.setView([partnerLoc.lat, partnerLoc.lng], 14); }
}

function renderWAI(el) {
  el.innerHTML = `
    <div class="wsub">${esc(aiName()).toUpperCase()}</div>
    <div class="wai-wave" id="wwave"><i></i><i></i><i></i><i></i></div>
    <div id="waiText" class="wsub" style="font-size:12px">tahan & ngomong…</div>
    <button class="wbtn" id="wmic">🎤 Bicara</button>`;
  $('#wmic').onclick = waiListen;
}

function waiListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !$('#waiText')) { $('#waiText') && ($('#waiText').textContent = 'browser tak dukung STT'); return; }
  const rec = new SR(); rec.lang = 'id-ID'; rec.interimResults = false;
  $('#waiText').textContent = 'mendengarkan…';
  rec.onresult = async (e) => {
    const text = e.results[0][0].transcript;
    $('#waiText').textContent = '“' + text + '”';
    let reply;
    try { const d = await api('/ai/chat', { method: 'POST', body: { message: text } }); reply = d.reply || '…'; }
    catch { reply = 'gagal hubungi AI'; }
    $('#waiText').textContent = reply;
    if (me.user.ai_enabled) speak(reply);
  };
  rec.onend = () => {}; rec.onerror = () => { $('#waiText').textContent = 'gagal dengar, coba lagi'; };
  rec.start();
}

function renderWKangen(el) {
  el.innerHTML = `
    <div class="wheart">💓</div>
    <div class="wsub">kirim kangen ke ${esc(me.partner.name)}</div>
    <button class="wbtn" id="wmiss">Kirim 💓</button>
    <div class="wsub" id="wmissStat"></div>`;
  $('#wmiss').onclick = () => socket?.connected ? socket.emit('miss:send', { pattern: 1 }) : toast('Belum terhubung');
  api('/miss/stats').then(s => { const el2 = $('#wmissStat'); if (el2) el2.textContent = `${s.sent}x kamu · ${s.received}x dia (minggu ini)`; });
}

function renderWMood(el) {
  el.innerHTML = `<div class="wsub">MOOD KAMU</div><div class="wmoodrow">` +
    ['😊','🥰','😴','🥺','😤','🤒','🔥','🎉'].map(e => `<button class="wmood ${me.user.mood === e ? 'on' : ''}" data-m="${e}">${e}</button>`).join('') +
    `</div><div class="wsub">ketuk buat kirim ke ${esc(me.partner.name)}</div>`;
  el.querySelectorAll('.wmood').forEach(b => b.onclick = async () => {
    me.user.mood = b.dataset.m;
    el.querySelectorAll('.wmood').forEach(x => x.classList.toggle('on', x === b));
    await api('/mood', { method: 'POST', body: { mood: b.dataset.m } });
  });
}

function renderWStatus(el) {
  el.innerHTML = `<div class="wsub">STATUS</div><div class="wstat">
    <div class="row"><span>Pasangan</span><b id="wsP">${esc(me.partner.name)}</b></div>
    <div class="row"><span>Link</span><b id="wsO">…</b></div>
    <div class="row"><span>Sinkron</span><b id="wsS">—</b></div>
    <div class="row"><span>Bersama</span><b>${daysTogether()} hari 💕</b></div>
    <div class="row"><span>Sejak</span><b>${new Date(me.pair.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
    <div class="row"><span>AI</span><b>${me.user.ai_enabled ? 'ON' : 'OFF'}</b></div>
  </div><button class="wbtn" id="wresync">↻ Re-sync</button>`;
  $('#wsO').textContent = $('#dot').textContent === '🟢' ? 'online' : 'offline';
  $('#wsS').textContent = lastSync ? agoText(lastSync) : '—';
  $('#wresync').onclick = async () => { schedCache = await api('/schedules'); const d = await api('/partner/location'); if (d?.lat) { partnerLoc = d; updatePartnerMarkers(d); } wMenu(); };
}

// ---------- PHONE MAP ----------
function initMap() {
  if (typeof L === 'undefined') { $('#view').innerHTML = '<div class="muted" style="padding:40px">Peta gagal dimuat — cek koneksi internet</div>'; return; }
  map = L.map('map', { zoomControl: false }).setView([-6.2, 106.8], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  if (myLoc) { markers.me = L.marker([myLoc.lat, myLoc.lng], { icon: mkIcon('#4fd8c0', me.user.name[0].toUpperCase()) }).addTo(map); map.setView([myLoc.lat, myLoc.lng], 15); }
  api('/partner/location').then(d => { if (d?.lat != null) { partnerLoc = d; lastSync = Date.now(); updatePartnerMarkers(d); if (d.trail?.length) { trailLine?.remove(); trailLine = L.polyline(d.trail.map(t => [t.lat, t.lng]), { color: '#5cc8ff', weight: 3, opacity: .5, dashArray: '6 8' }).addTo(map); } } });
}

// ---------- SCHEDULE ----------
async function loadSchedules() {
  schedCache = await api('/schedules');
  const now = Date.now();
  const until = (t) => { const m = Math.round((t - now) / 60000); if (m <= 0) return 'sekarang'; if (m < 60) return m + ' mnt lagi'; if (m < 1440) return Math.round(m / 60) + ' jam lagi'; return Math.round(m / 1440) + ' hari lagi'; };
  $('#slist').innerHTML = schedCache.map(s => {
    const active = s.start_time <= now && (s.end_time || s.start_time + 3600000) > now;
    const d = new Date(s.start_time);
    const dayLabel = d.toDateString() === new Date().toDateString() ? 'hari ini' : d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="item ${active ? 'now' : ''}">
      <div class="itemtime"><b>${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b><span>${dayLabel}</span></div>
      <div class="itembody"><div>${sicon(s.title)} ${esc(s.title)}</div><span class="chip">${active ? '🔥 berlangsung' : '⏳ ' + until(s.start_time)}</span></div>
      <button class="del" data-id="${s.id}">🗑</button></div>`;
  }).join('') || `<div class="empty"><div>📅</div><b>Belum ada jadwal</b><p>Tambah jadwal bareng ${esc(me.partner.name)}</p></div>`;
  document.querySelectorAll('.del').forEach(b => b.onclick = async () => { await api('/schedules/' + b.dataset.id, { method: 'DELETE' }); schedCache = await api('/schedules'); loadSchedules(); });
}

async function addSchedule() {
  const title = $('#st').value.trim(), start = new Date($('#stime').value).getTime();
  if (!title) return toast('Isi judul jadwal dulu');
  if (!start || isNaN(start)) return toast('Pilih tanggal & jam dulu');
  await api('/schedules', { method: 'POST', body: { title, start, notify: true } });
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
  const withSched = new Set(schedCache.filter(s => { const d = new Date(s.start_time); return d.getFullYear() === y && d.getMonth() === m; }).map(s => new Date(s.start_time).getDate()));
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
    if (s.notify && !reminded.has(s.id) && Math.abs(Date.now() - s.start_time) < 60000) {
      reminded.add(s.id);
      localStorage.cw_reminded = JSON.stringify([...reminded].slice(-100));
      navigator.vibrate?.([300, 100, 300]);
      try { new Notification('⏰ ' + s.title, { body: 'Jadwal kalian mulai sekarang!' }); } catch {}
      try { speak(`Waktunya: ${s.title}`); } catch {}
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
  if (me.user.ai_enabled) speak(reply);
}

function setupMic(btnSel, inputSel) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $(btnSel);
  if (!SR) { btn.disabled = true; return; }
  const rec = new SR(); rec.lang = 'id-ID'; rec.interimResults = false;
  btn.onclick = () => { btn.classList.add('rec'); rec.start(); };
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
function speak(text) {
  const clean = text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/[*_`~#]/g, '')
    .replace(/\s{2,}/g, ' ').trim();
  if (!clean) return;
  try { speechSynthesis?.cancel(); } catch {}
  ttsAudio?.pause(); ttsAudio = null;
  const g = me?.user?.ai_gender || 'cewe';
  fetch('/api/tts?g=' + g + '&t=' + encodeURIComponent(clean.slice(0, 380)), { headers: { 'x-token': localStorage.cw_token } })
    .then(async r => {
      if (!r.ok) return speakBrowser(clean);
      const a = new Audio(URL.createObjectURL(await r.blob()));
      ttsAudio = a;
      a.onended = () => { URL.revokeObjectURL(a.src); if (ttsAudio === a) ttsAudio = null; };
      a.onerror = () => speakBrowser(clean);
      a.play().catch(() => speakBrowser(clean));
    })
    .catch(() => speakBrowser(clean));
}
function speakBrowser(clean) {
  try {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean); u.lang = 'id-ID';
    const v = pickVoice();
    if (v) u.voice = v;
    u.pitch = +(localStorage.cw_pitch || VOICE_PITCH[me?.user?.ai_gender] || VOICE_PITCH.cewe);
    u.rate = +(localStorage.cw_rate || 0.98);
    u.volume = 1;
    speechSynthesis.speak(u);
  } catch {}
}

// ---------- WALLPAPER MENU (dari app, seperti companion watch app) ----------
function paperMenu() {
  if ($('.settings')) return;
  const el = document.createElement('div'); el.className = 'settings card';
  const custom = localStorage.cw_wpaper === 'custom' && localStorage.cw_wpaper_img;
  el.innerHTML = `<h3>🎨 Wallpaper jam</h3>
    <div class="wprow">` +
      WPAPERS.map((w, i) => `<button class="wpswatch ${!custom && i === +(localStorage.cw_wpaper || 0) ? 'on' : ''}" data-i="${i}" style="background:${w.css}"><span>${w.name}</span></button>`).join('') +
      (custom ? `<button class="wpswatch on" data-i="custom" style="background:url(${localStorage.cw_wpaper_img}) center/cover"><span>Galeri</span></button>` : '') +
    `</div>
    <label class="ghost" style="display:block;text-align:center;padding:13px;border-radius:12px;border:1px solid var(--line);cursor:pointer">🖼️ Pilih dari galeri…<input type="file" id="wfile" accept="image/*" hidden></label>
    ${custom ? '<button id="wdel" class="ghost" style="border-color:#ff8a8a;color:#ff8a8a">🗑 Hapus wallpaper galeri</button>' : ''}
    <button id="cls4" class="ghost">Tutup</button>`;
  $('#view').appendChild(el);
  el.querySelector('#cls4').onclick = () => el.remove();
  el.querySelector('#wdel')?.addEventListener('click', () => {
    delete localStorage.cw_wpaper_img; localStorage.cw_wpaper = 0;
    applyWPaper(); toast('Wallpaper galeri dihapus'); el.remove(); paperMenu();
  });
  el.querySelectorAll('.wpswatch[data-i]').forEach(b => b.onclick = () => {
    if (b.dataset.i === 'custom') return;
    localStorage.cw_wpaper = b.dataset.i;
    applyWPaper(); el.remove(); paperMenu();
  });
  el.querySelector('#wfile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    el.remove(); cropWallpaper(f);
  };
}

// ---------- CROP WALLPAPER (lingkaran = layar jam) ----------
function cropWallpaper(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const Z = 240; // ukuran cropzone px
    const base = Math.max(Z / img.width, Z / img.height);
    let z = 1, dx = 0, dy = 0;
    const el = document.createElement('div'); el.className = 'settings card';
    el.innerHTML = `<h3>✂️ Atur wallpaper</h3>
      <div class="cropzone"><img id="cropimg" src="${url}" draggable="false"></div>
      <input type="range" id="cropzoom" min="1" max="3" step="0.01" value="1">
      <div class="muted" style="font-size:12px">geser &amp; zoom — lingkaran = layar jam</div>
      <button id="cropsave">Pasang</button><button id="cropcancel" class="ghost">Batal</button>`;
    $('#view').appendChild(el);
    const ci = el.querySelector('#cropimg');
    const draw = () => { ci.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${base * z})`; };
    ci.style.transformOrigin = 'center'; ci.onload = draw; draw();
    let drag = null;
    const zone = el.querySelector('.cropzone');
    zone.onpointerdown = (e) => { drag = { x: e.clientX - dx, y: e.clientY - dy }; zone.setPointerCapture(e.pointerId); };
    zone.onpointermove = (e) => { if (!drag) return; dx = e.clientX - drag.x; dy = e.clientY - drag.y; draw(); };
    zone.onpointerup = () => drag = null;
    el.querySelector('#cropzoom').oninput = (e) => { z = +e.target.value; draw(); };
    el.querySelector('#cropcancel').onclick = () => { URL.revokeObjectURL(url); el.remove(); paperMenu(); };
    el.querySelector('#cropsave').onclick = () => {
      const s = base * z, dw = img.width * s, dh = img.height * s;
      const left = (Z - dw) / 2 + dx, top = (Z - dh) / 2 + dy;
      const c = document.createElement('canvas'); c.width = c.height = 600;
      c.getContext('2d').drawImage(img, -left / s, -top / s, Z / s, Z / s, 0, 0, 600, 600);
      try {
        localStorage.cw_wpaper_img = c.toDataURL('image/jpeg', .82);
        localStorage.cw_wpaper = 'custom';
        applyWPaper(); toast('Wallpaper dipasang 🖼️');
      } catch { toast('Gambar terlalu besar'); }
      URL.revokeObjectURL(url); el.remove(); paperMenu();
    };
  };
  img.src = url;
}

// ---------- VOICE NOTES ----------
let vrec = null, vchunks = [], vstart = 0, vtimer = null;
function setupVoice() {
  const btn = $('#vrec'), st = $('#vstate');
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      vrec = new MediaRecorder(stream); vchunks = []; vstart = Date.now();
      vrec.ondataavailable = e => vchunks.push(e.data);
      vrec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const dur = (Date.now() - vstart) / 1000;
        if (dur < 0.5) { st.textContent = 'terlalu pendek — tahan lebih lama'; return; }
        const blob = new Blob(vchunks, { type: vrec.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          const r = await api('/voice', { method: 'POST', body: { audio: reader.result, dur } });
          st.textContent = r.ok ? `Terkirim ke ${me.partner.name} 🎤` : (r.error || 'gagal kirim');
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
    <button id="wclose" class="ghost" style="margin-top:14px">Tutup</button>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#wclose').onclick = () => el.remove();
  el.onclick = e => { if (e.target === el) el.remove(); };
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

// ---------- SETTINGS ----------
function settings() {
  if ($('.settings')) return;
  const el = document.createElement('div'); el.className = 'settings card';
  el.innerHTML = `<h3>⚙️ Pengaturan</h3>
    <div class="muted">Kamu: <b>${esc(me.user.name)}</b> · Pasangan: <b>${esc(me.partner.name)}</b></div>
    <div class="muted">Sejak ${new Date(me.pair.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · hari ke-${daysTogether()}</div>
    <div class="muted" style="text-align:left;font-size:12px">Mood kamu sekarang:</div>
    <div class="moodrow">${['😊','🥰','😴','🥺','😤','🤒','🔥','🎉'].map(e => `<button class="mood ${me.user.mood === e ? 'on' : ''}" data-m="${e}">${e}</button>`).join('')}</div>
    <div class="hqin" style="margin-top:8px"><input id="statusIn" placeholder="Status kamu (misal: lagi sibuk 💼)" maxlength="40" value="${esc(me.user.status || '')}"><button id="statusBtn" class="mini">Simpan</button></div>
    <button id="aipSet" class="ghost">✦ Profil bestie (${esc(me.user.ai_name || 'belum dinamai')})</button>
    <button id="wpSet" class="ghost">🎨 Wallpaper jam</button>
    <button id="hist" class="ghost">💓 Riwayat kangen</button>
    <button id="wrapBtn" class="ghost">📊 Rekap bulan ini</button>
    <button id="wrapYr" class="ghost">🗓️ Rekap ${new Date().getFullYear()}</button>
    <button id="exportBtn" class="ghost">⬇️ Export semua data</button>
    ${deferredInstall ? '<button id="install" class="ghost">📲 Install aplikasi</button>' : ''}
    <div class="muted" style="text-align:left;font-size:12px">Tema:</div>
    <div class="themrow">${[['', '🌊', 'Langit'], ['light', '☀️', 'Terang'], ['sakura', '🌸', 'Sakura'], ['lavender', '💜', 'Lavender'], ['forest', '🌿', 'Hutan']].map(([t, e, n]) => `<button class="tswatch ${(document.documentElement.dataset.theme || '') === t ? 'on' : ''}" data-t="${t}"><span>${e}</span><i>${n}</i></button>`).join('')}</div>
    <button id="brk" class="ghost" style="border-color:var(--accent);color:var(--accent)">💔 Putus pair</button>
    <button id="cls" class="ghost">Tutup</button>`;
  $('#view').appendChild(el);
  el.querySelector('#cls').onclick = () => el.remove();
  el.querySelectorAll('.mood').forEach(b => b.onclick = async () => {
    me.user.mood = b.dataset.m;
    el.querySelectorAll('.mood').forEach(x => x.classList.toggle('on', x === b));
    await api('/mood', { method: 'POST', body: { mood: b.dataset.m } });
    toast(`Mood kamu: ${b.dataset.m}`);
  });
  el.querySelector('#wrapBtn').onclick = () => { el.remove(); wrappedModal(); };
  el.querySelector('#wrapYr').onclick = () => { el.remove(); wrappedModal('year'); };
  el.querySelector('#exportBtn').onclick = async () => {
    const r = await fetch('/api/export', { headers: { 'x-token': localStorage.cw_token } });
    if (!r.ok) return toast('gagal export');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ryora-export.json'; a.click();
    URL.revokeObjectURL(a.href); toast('Data di-export ⬇️');
  };
  el.querySelectorAll('.tswatch').forEach(b => b.onclick = () => {
    document.documentElement.dataset.theme = b.dataset.t;
    localStorage.cw_theme = b.dataset.t;
    el.querySelectorAll('.tswatch').forEach(x => x.classList.toggle('on', x === b));
  });
  el.querySelector('#statusBtn').onclick = async () => {
    const t = el.querySelector('#statusIn').value.trim();
    me.user.status = t;
    await api('/status', { method: 'POST', body: { text: t } });
    toast(t ? `Status: "${t}"` : 'Status dihapus');
  };
  el.querySelector('#hist').onclick = missHistory;
  el.querySelector('#aipSet').onclick = () => { el.remove(); aiProfile(); };
  el.querySelector('#wpSet').onclick = () => { el.remove(); paperMenu(); };
  const ins = el.querySelector('#install');
  if (ins) ins.onclick = async () => { deferredInstall?.prompt(); deferredInstall = null; ins.remove(); };
  el.querySelector('#brk').onclick = async () => {
    if (confirm('Yakin putus pair? Semua data jadwal & kangen dihapus.')) { await api('/pair/break', { method: 'POST' }); location.reload(); }
  };
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

// ---------- INIT ----------
if (localStorage.cw_theme) document.documentElement.dataset.theme = localStorage.cw_theme;
Notification?.permission === 'default' && Notification.requestPermission();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (token) boot(); else authScreen();
