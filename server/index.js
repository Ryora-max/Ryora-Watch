import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { store } from './store.js';
import { aiChat } from './ai.js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
const webpush = createRequire(import.meta.url)('web-push');

// --- Web Push: VAPID keys persist di data/vapid.json (generate sekali) ---
let VAPID = null;
try {
  fs.mkdirSync('data', { recursive: true });
  const f = 'data/vapid.json';
  VAPID = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : webpush.generateVAPIDKeys();
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(VAPID));
  webpush.setVapidDetails('mailto:ryora@local', VAPID.publicKey, VAPID.privateKey);
} catch (e) { console.log('[push] VAPID gagal:', e.message); }
const sendPush = (userId, payload) => {
  if (!VAPID) return;
  for (const s of store.pushFor(userId)) {
    webpush.sendNotification({ endpoint: s.endpoint, keys: { auth: s.auth, p256dh: s.p256dh } }, JSON.stringify(payload))
      .catch(e => { if (e.statusCode === 410 || e.statusCode === 404) store.delPush(s.endpoint); });
  }
};
const pushPartner = (u, payload) => { const p = u.pair_id ? store.partnerOf(u) : null; if (p) sendPush(p.id, payload); };

const app = express();
const http = createServer(app);
const io = new Server(http);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '3mb' }));
app.use(express.static('public'));

const auth = (req, res, next) => {
  const token = req.headers['x-token'];
  const u = token ? store.userByToken(token) : null;
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  req.user = u; next();
};

// --- Auth & Pairing ---
const regAttempts = new Map(); // ip -> {n, reset} — anti spam akun
app.post('/api/register', (req, res) => {
  const now = Date.now(), ip = req.ip || 'x', a = regAttempts.get(ip);
  if (a && now < a.reset && a.n >= 20) return res.status(429).json({ error: 'terlalu banyak — coba lagi nanti' });
  regAttempts.set(ip, { n: (a && now < a.reset ? a.n : 0) + 1, reset: a && now < a.reset ? a.reset : now + 3600000 });
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'nama wajib' });
  const u = store.createUser(name.trim().slice(0, 30));
  res.json({ token: u.token, user: { id: u.id, name: u.name } });
});

app.post('/api/pair/create', auth, (req, res) => {
  if (req.user.pair_id) return res.status(400).json({ error: 'sudah dalam pair' });
  res.json({ code: store.createPair(req.user.id).code });
});

app.post('/api/pair/join', auth, (req, res) => {
  if (req.user.pair_id) {
    const p = store.pairOf(req.user.id);
    if (p?.status === 'sealed') return res.json({ sealed: true });
    // Punya pair 'waiting' (kode sendiri belum dipakai) → lepas dulu, boleh ganti pakai kode pasangan
    if (p) store.breakPair(p.id);
  }
  const p = store.joinPair(req.user.id, req.body?.code || '');
  if (p === 'expired') return res.status(410).json({ error: 'kode kedaluwarsa (>24 jam), minta kode baru' });
  if (!p) return res.status(404).json({ error: 'kode tidak valid atau sudah dipakai' });
  res.json({ sealed: true });
});

app.post('/api/pair/break', auth, (req, res) => {
  if (req.user.pair_id) store.breakPair(req.user.pair_id);
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const partner = req.user.pair_id ? store.partnerOf(req.user) : null;
  const pair = req.user.pair_id ? store.pairOf(req.user.id) : null;
  res.json({ user: { id: req.user.id, name: req.user.name, avatar: req.user.avatar, pet_name: req.user.pet_name, bday: req.user.bday, dnd_from: req.user.dnd_from, dnd_to: req.user.dnd_to, ai_enabled: !!req.user.ai_enabled, mood: req.user.mood, ai_name: req.user.ai_name, ai_gender: req.user.ai_gender, status: req.user.status }, pair, partner, online: partner ? online.has(partner.id) : false, partnerBattery: partner ? (batt.get(partner.id) ?? null) : null, partnerLastSeen: partner?.last_seen ?? null });
});

app.post('/api/ai/toggle', auth, (req, res) => {
  store.setAi(req.user.id, !!req.body?.on);
  res.json({ ok: true });
});

app.post('/api/mood', auth, (req, res) => {
  const mood = String(req.body?.mood || '').slice(0, 8);
  store.setMood(req.user.id, mood);
  if (req.user.pair_id) {
    store.logMood(req.user.id, req.user.pair_id, mood);
    io.to(req.user.pair_id).emit('partner:mood', { mood, uid: req.user.id });
  }
  res.json({ ok: true });
});

// mood 7 hari terakhir berdua — mood terakhir per hari
app.get('/api/mood/week', auth, (req, res) => {
  if (!req.user.pair_id) return res.json({ me: {}, them: {} });
  const partner = store.partnerOf(req.user);
  const rows = store.moodWeek(req.user.pair_id, Date.now() - 7 * 86400000);
  const me = {}, them = {};
  for (const r of rows) {
    const k = new Date(r.ts).toDateString();
    (r.user_id === req.user.id ? me : them)[k] = r.mood;
  }
  res.json({ me, them });
});

// --- Schedules ---
app.get('/api/schedules', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.schedules(req.user.pair_id));
});
app.post('/api/schedules', auth, (req, res) => {
  const { title, note, start, end, notify, repeat } = req.body || {};
  if (!req.user.pair_id || !title || !start) return res.status(400).json({ error: 'invalid' });
  const rep = ['daily', 'weekly'].includes(repeat) ? repeat : null;
  store.addSchedule({ pair_id: req.user.pair_id, title: title.slice(0, 80), note, start, end, notify, by: req.user.id, repeat: rep });
  io.to(req.user.pair_id).emit('schedules:changed');
  pushPartner(req.user, { title: '📅 Ryora Watch', body: `${req.user.name} nambah jadwal: ${title.slice(0, 60)}`, tag: 'sched' });
  res.json({ ok: true });
});
app.delete('/api/schedules/:id', auth, (req, res) => {
  store.delSchedule(req.user.pair_id, req.params.id);
  io.to(req.user.pair_id).emit('schedules:changed');
  res.json({ ok: true });
});

// --- Location ---
app.get('/api/partner/location', auth, (req, res) => {
  const p = store.partnerOf(req.user);
  if (!p) return res.json(null);
  res.json({ ...store.latestLoc(p.id), trail: store.trail(p.id, Date.now() - 3600000) });
});

// --- Miss you ---
app.get('/api/miss/stats', auth, (req, res) => {
  if (!req.user.pair_id) return res.json({ sent: 0, received: 0, streak: 0 });
  const week = Date.now() - 7 * 86400000;
  const p = store.partnerOf(req.user);
  res.json({ sent: store.missCount(req.user.pair_id, req.user.id, week), received: p ? store.missCount(req.user.pair_id, p.id, week) : 0, streak: store.missStreak(req.user.pair_id) });
});

app.get('/api/miss/history', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.missHistory(req.user.pair_id));
});

// --- Daily couple features (Home dashboard) ---
const QUESTIONS = [
  'Kalau hari ini kita bisa pergi ke mana aja, kamu mau ke mana?',
  'Hal kecil apa yang pernah aku lakuin yang bikin kamu senyum?',
  'Lagu apa yang ngingetin kamu ke kita?',
  'Makanan apa yang paling pengen kamu makan bareng aku?',
  'Kalau lagi kangen, hal pertama yang kamu lakuin apa?',
  'Mimpi bareng kita yang pengen kamu wujudin duluan apa?',
  'Momen favorit kita sejauh ini apa?',
  'Kalau kita jadi karakter film, film apa?',
  'Hal yang paling kamu syukuri dari hubungan kita?',
  'Kalau bisa teleport ke aku sekarang, hal pertama yang kamu lakuin apa?',
  'Kebiasaan aku yang paling gemes menurut kamu?',
  'Liburan impian kita: pantai, gunung, atau kota?',
  'Pesan untuk aku 5 tahun dari sekarang?',
  'Film atau series yang pengen kamu tonton bareng aku?',
  'Hal apa yang bikin kamu ngerasa paling disayang?',
  'Kalau aku lagi sedih, cara terbaik menghiburku apa?',
  'Kata-kata aku yang paling kamu ingat?',
  'Kencan sempurna versi kamu kayak gimana?',
  'Hal baru yang pengen kita coba bareng?',
  'Kalau kita masak bareng, mau masak apa?',
  'Hari pertama kita connect — apa yang kamu ingat?',
  'Hal yang paling kamu kagumi dari aku?',
  'Lagu buat slow dance bareng?',
  'Musim favorit buat date?',
  'Kalau aku jadi hewan, hewan apa?',
  'Tradisi kecil yang pengen kamu mulai bareng aku?',
  'Hal yang pengen kamu ucapin tapi jarang diucapin?',
  'Akhir pekan ideal kita = ?',
  'Satu hal yang kamu janjiin untuk kita?',
  'Warna yang paling ngingetin kamu ke aku? Kenapa?',
];
const dayKey = () => new Date().toISOString().slice(0, 10);
const todayQ = () => QUESTIONS[Math.floor(Date.now() / 86400000) % QUESTIONS.length];

app.get('/api/home', auth, (req, res) => {
  const partner = req.user.pair_id ? store.partnerOf(req.user) : null;
  if (!req.user.pair_id || !partner) return res.json({});
  const day = dayKey();
  const ans = store.answers(req.user.pair_id, day);
  const pho = store.photos(req.user.pair_id, day);
  const mine = ans.find(a => a.user_id === req.user.id)?.text || null;
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekKey = weekAgo.toISOString().slice(0, 10);
  res.json({
    q: todayQ(),
    myAnswer: mine,
    theirAnswer: mine ? (ans.find(a => a.user_id === partner.id)?.text || null) : null, // reveal hanya setelah kamu jawab
    myNote: store.noteOf(req.user.id)?.text || '',
    theirNote: store.noteOf(partner.id)?.text || '',
    photos: pho.map(p => ({ mine: p.user_id === req.user.id, img: p.img, caption: p.caption, ts: p.ts, reacts: store.reactionsFor(req.user.pair_id, 'photo', day + ':' + p.user_id).map(r => ({ emoji: r.emoji, mine: r.user_id === req.user.id })) })),
    answerReacts: store.reactionsFor(req.user.pair_id, 'answer', day).map(r => ({ emoji: r.emoji, mine: r.user_id === req.user.id })),
    streak: store.missStreak(req.user.pair_id),
    feed: store.feed(req.user.pair_id, 8).map(f => ({ ...f, mine: f.uid === req.user.id, who: f.uid === req.user.id ? req.user.name : partner.name })),
    recap: {
      miss: store.missCount(req.user.pair_id, req.user.id, weekAgo.getTime()) + store.missCount(req.user.pair_id, partner.id, weekAgo.getTime()),
      sched: store.schedules(req.user.pair_id).filter(s => s.start_time >= weekAgo.getTime() && s.start_time <= Date.now()).length,
      photo: store.photosSince(req.user.pair_id, weekKey),
      ans: store.answersSince(req.user.pair_id, weekKey),
    },
  });
});

// --- Bucket list bersama ---
app.get('/api/bucket', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.bucket(req.user.pair_id));
});
app.post('/api/bucket', auth, (req, res) => {
  if (!req.user.pair_id || !req.body?.text?.trim()) return res.status(400).json({ error: 'invalid' });
  store.addBucket(req.user.pair_id, req.body.text.trim().slice(0, 120), req.user.id);
  io.to(req.user.pair_id).emit('bucket:changed');
  res.json({ ok: true });
});
app.post('/api/bucket/:id/toggle', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  const item = store.bucket(req.user.pair_id).find(b => b.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  store.setBucketDone(req.user.pair_id, item.id, !item.done);
  io.to(req.user.pair_id).emit('bucket:changed');
  res.json({ ok: true });
});
app.delete('/api/bucket/:id', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  store.delBucket(req.user.pair_id, req.params.id);
  io.to(req.user.pair_id).emit('bucket:changed');
  res.json({ ok: true });
});

app.get('/api/weather', auth, async (req, res) => {
  const myLoc = store.latestLoc(req.user.id);
  const partner = req.user.pair_id ? store.partnerOf(req.user) : null;
  const pLoc = partner ? store.latestLoc(partner.id) : null;
  const out = { me: null, partner: null };
  try {
    const { weatherFor } = await import('./ai.js');
    if (myLoc?.lat) out.me = await weatherFor(myLoc.lat, myLoc.lng);
    if (pLoc?.lat) out.partner = await weatherFor(pLoc.lat, pLoc.lng);
  } catch {}
  res.json(out);
});

app.get('/api/suit/stats', auth, (req, res) => {
  if (!req.user.pair_id) return res.json({ me: 0, them: 0, draw: 0 });
  const partner = store.partnerOf(req.user);
  const rows = store.suitStats(req.user.pair_id);
  const n = (id) => rows.find(r => r.winner_id === id)?.n || 0;
  res.json({ me: n(req.user.id), them: partner ? n(partner.id) : 0, draw: n('draw') });
});

app.get('/api/activity', auth, (req, res) => {
  if (!req.user.pair_id) return res.json({ days: {} });
  res.json({ days: store.activityDays(req.user.pair_id, Date.now() - 42 * 86400000) });
});

// sapaan pagi otomatis — dipanggil sekali per hari per device
app.post('/api/ai/greeting', auth, async (req, res) => {
  const partner = req.user.pair_id ? store.partnerOf(req.user) : null;
  const h = new Date().getHours();
  const waktu = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 19 ? 'sore' : 'malam';
  const schedules = req.user.pair_id ? store.schedules(req.user.pair_id) : [];
  const ctx = {
    user: req.user, partner, schedules,
    loc: partner ? store.latestLoc(partner.id) : null,
    aiName: req.user.ai_name, aiGender: req.user.ai_gender,
    history: [], facts: store.facts(req.user.id, 5),
  };
  const today = schedules.filter(s => new Date(s.start_time).toDateString() === new Date().toDateString());
  const hint = today.length ? `jadwal kalian hari ini: ${today.map(s => s.title).join(', ')}` : 'jadwal kosong';
  let greeting = null;
  try {
    const { aiGreet } = await import('./ai.js');
    greeting = await aiGreet(ctx, waktu, hint);
  } catch {}
  if (!greeting) {
    greeting = `Selamat ${waktu}, ${req.user.name}! ☀️ ${today.length ? `btw hari ini ada ${today[0].title} loh` : 'semoga harinya lembut ya'}`;
  }
  store.addChatMsg(req.user.id, 'model', greeting);
  res.json({ greeting });
});

// bestie proaktif — check-in random di tengah hari
app.post('/api/ai/ping', auth, async (req, res) => {
  const partner = req.user.pair_id ? store.partnerOf(req.user) : null;
  const schedules = req.user.pair_id ? store.schedules(req.user.pair_id) : [];
  const ctx = {
    user: req.user, partner, schedules,
    loc: partner ? store.latestLoc(partner.id) : null,
    aiName: req.user.ai_name, aiGender: req.user.ai_gender,
    history: [], facts: store.facts(req.user.id, 5),
  };
  const hints = ['ingetin dia minum air / makan', 'tanyain lagi ngapain', 'kirim semangat kecil', 'bikin joke receh', 'ingetin istirahat'];
  let greeting = null;
  try {
    const { aiGreet } = await import('./ai.js');
    greeting = await aiGreet(ctx, 'check-in', hints[Math.floor(Math.random() * hints.length)] + ' — SATU kalimat aja, casual banget');
  } catch {}
  if (!greeting) greeting = 'Eh, jangan lupa minum ya 💧';
  store.addChatMsg(req.user.id, 'model', greeting);
  res.json({ greeting });
});

app.post('/api/react', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  const { type, tid, emoji } = req.body || {};
  if (!['answer', 'photo', 'memory'].includes(type) || !tid) return res.status(400).json({ error: 'invalid' });
  store.setReaction(req.user.pair_id, type, String(tid).slice(0, 60), req.user.id, emoji ? String(emoji).slice(0, 8) : null);
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

// --- TTS neural (suara cowo/cewe beneran beda — Edge voices Indonesia) ---
const TTS_VOICES = { cowo: 'id-ID-ArdiNeural', cewe: 'id-ID-GadisNeural' };
const lastTts = new Map();
const TTS_CACHE = 'data/tts-cache';
try { fs.mkdirSync(TTS_CACHE, { recursive: true }); } catch {}
const ttsKey = (g, t) => createHash('sha1').update(g + '|' + t).digest('hex') + '.mp3';
app.get('/api/tts', auth, async (req, res) => {
  const text = String(req.query.t || '').slice(0, 400);
  if (!text) return res.status(400).json({ error: 'kosong' });
  const now = Date.now();
  if (now - (lastTts.get(req.user.id) || 0) < 800) return res.status(429).json({ error: 'terlalu cepat' });
  lastTts.set(req.user.id, now);
  const voice = req.query.g === 'cowo' ? 'cowo' : 'cewe';
  const key = ttsKey(voice, text);
  const file = `${TTS_CACHE}/${key}`;
  try { if (fs.existsSync(file)) return res.type('audio/mpeg').send(fs.readFileSync(file)); } catch {}
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(TTS_VOICES[voice], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text, { rate: '+0%' });
    const chunks = [];
    audioStream.on('data', c => chunks.push(c));
    audioStream.on('end', () => {
      const buf = Buffer.concat(chunks);
      try {
        fs.writeFileSync(file, buf);
        // batasi cache 300 file terbaru
        const files = fs.readdirSync(TTS_CACHE);
        if (files.length > 300) files.map(f => [f, fs.statSync(`${TTS_CACHE}/${f}`).mtimeMs]).sort((a, b) => a[1] - b[1]).slice(0, files.length - 300).forEach(([f]) => fs.unlinkSync(`${TTS_CACHE}/${f}`));
      } catch {}
      res.type('audio/mpeg').send(buf);
    });
    audioStream.on('error', () => res.status(502).json({ error: 'tts gagal' }));
  } catch { res.status(502).json({ error: 'tts gagal' }); }
});

// --- Status text, countdown ketemu, kenangan ---
// cadangan akun — login ulang pakai token (kode cadangan)
app.post('/api/restore', (req, res) => {
  const u = store.userByToken(String(req.body?.code || '').trim());
  if (!u) return res.status(404).json({ error: 'kode salah' });
  res.json({ token: u.token, user: { id: u.id, name: u.name } });
});

app.post('/api/profile', auth, (req, res) => {
  const { name, avatar, pet_name, bday, dnd_from, dnd_to } = req.body || {};
  if (name != null && !String(name).trim()) return res.status(400).json({ error: 'nama kosong' });
  store.setProfile(req.user.id, { name, avatar, pet_name, bday, dnd_from, dnd_to });
  if (req.user.pair_id) io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

app.post('/api/pair/since', auth, (req, res) => {
  const ts = +req.body?.ts;
  if (!ts || ts > Date.now() || !req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  store.setSince(req.user.pair_id, ts);
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

app.post('/api/song', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  store.setSong(req.user.pair_id, req.body?.text);
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

// --- Kado kejutan (time capsule) — pesan terkunci sampai tanggal buka ---
app.get('/api/capsules', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  const now = Date.now();
  res.json(store.capsules(req.user.pair_id).map(c => ({
    id: c.id, user_id: c.user_id, from_name: c.from_name, unlock_ts: c.unlock_ts, ts: c.ts,
    mine: c.user_id === req.user.id, locked: c.unlock_ts > now,
    text: c.unlock_ts <= now || c.user_id === req.user.id ? c.text : null,
  })));
});
app.post('/api/capsule', auth, (req, res) => {
  const { text, unlock_ts } = req.body || {};
  if (!req.user.pair_id || !text?.trim() || !unlock_ts) return res.status(400).json({ error: 'invalid' });
  if (unlock_ts <= Date.now()) return res.status(400).json({ error: 'tanggal harus di masa depan' });
  store.addCapsule(req.user.pair_id, req.user.id, String(text).slice(0, 1000), +unlock_ts);
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});
app.delete('/api/capsule/:id', auth, (req, res) => {
  store.delCapsule(req.user.pair_id, req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/status', auth, (req, res) => {
  const s = String(req.body?.text || '').slice(0, 40);
  store.setStatus(req.user.id, s);
  if (req.user.pair_id) io.to(req.user.pair_id).emit('partner:statustext', { text: s, uid: req.user.id });
  res.json({ ok: true });
});

app.post('/api/meet', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  store.setNextMeet(req.user.pair_id, req.body?.ts || null);
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

app.get('/api/memories', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.memories(req.user.pair_id).map(m => ({ ...m, mine: m.user_id === req.user.id })));
});
app.post('/api/memory', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  const img = String(req.body?.img || '');
  if (!img.startsWith('data:image/') || img.length > 400000) return res.status(400).json({ error: 'gambar terlalu besar' });
  store.addMemory(req.user.pair_id, req.user.id, img, String(req.body?.caption || '').slice(0, 120));
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});
app.delete('/api/memory/:id', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  store.delMemory(req.user.pair_id, req.params.id, req.user.id);
  res.json({ ok: true });
});

// --- Voice notes & rekap bulanan ---
app.get('/api/voices', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.voices(req.user.pair_id).map(v => ({ ...v, mine: v.user_id === req.user.id })));
});
app.post('/api/voice', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  const audio = String(req.body?.audio || '');
  const dur = Math.min(30, Math.max(1, Math.round(req.body?.dur || 0)));
  if (!audio.startsWith('data:audio/') || audio.length > 900000) return res.status(400).json({ error: 'audio terlalu besar' });
  store.addVoice(req.user.pair_id, req.user.id, audio, dur);
  io.to(req.user.pair_id).emit('voice:new', { from: req.user.name, dur });
  pushPartner(req.user, { title: '🎤 Ryora Watch', body: `${req.user.name} kirim pesan suara (${dur}s)`, tag: 'voice' });
  res.json({ ok: true });
});
app.delete('/api/voice/:id', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  store.delVoice(req.user.pair_id, req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/wrapped', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  const now = new Date();
  const yearly = req.query.period === 'year';
  const since = yearly ? new Date(now.getFullYear(), 0, 1).getTime() : new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const s = store.monthStats(req.user.pair_id, since);
  const partner = store.partnerOf(req.user);
  res.json({
    month: yearly ? 'Tahun ' + now.getFullYear() : now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    me: req.user.name, partner: partner?.name,
    days: Math.floor((Date.now() - store.pairOf(req.user.id).created_at) / 86400000) + 1,
    ...s,
    miss_me: s.miss_by.find(x => x.from_user === req.user.id)?.c || 0,
    miss_them: s.miss_by.find(x => x.from_user === partner?.id)?.c || 0,
  });
});

app.get('/api/export', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  const partner = store.partnerOf(req.user);
  res.setHeader('Content-Disposition', 'attachment; filename="ryora-export.json"');
  res.json({ exported_at: new Date().toISOString(), names: [req.user.name, partner?.name], ...store.exportPair(req.user.pair_id) });
});

app.post('/api/note', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  store.setNote(req.user.id, req.user.pair_id, String(req.body?.text || '').slice(0, 200));
  io.to(req.user.pair_id).emit('home:changed');
  pushPartner(req.user, { title: '📝 Ryora Watch', body: `${req.user.name} ninggalin catatan buat kamu`, tag: 'note' });
  res.json({ ok: true });
});

app.post('/api/daily/answer', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  store.setAnswer(req.user.pair_id, dayKey(), req.user.id, String(req.body?.text || '').slice(0, 300));
  io.to(req.user.pair_id).emit('home:changed');
  pushPartner(req.user, { title: '❓ Ryora Watch', body: `${req.user.name} udah jawab pertanyaan hari ini — giliran kamu!`, tag: 'answer' });
  res.json({ ok: true });
});

app.post('/api/photo', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  const img = String(req.body?.img || '');
  if (!img.startsWith('data:image/') || img.length > 400000) return res.status(400).json({ error: 'gambar terlalu besar' });
  store.setPhoto(req.user.pair_id, dayKey(), req.user.id, img, String(req.body?.caption || '').slice(0, 100));
  io.to(req.user.pair_id).emit('home:changed');
  pushPartner(req.user, { title: '📸 Ryora Watch', body: `${req.user.name} kirim foto hari ini`, tag: 'photo' });
  res.json({ ok: true });
});

app.post('/api/ai/prefs', auth, (req, res) => {
  const { name, gender } = req.body || {};
  if (name !== undefined) store.setAiName(req.user.id, String(name).trim().slice(0, 20) || null);
  if (gender === 'cowo' || gender === 'cewe') store.setAiGender(req.user.id, gender);
  res.json({ ok: true });
});

// --- Web Push & Surat ---
app.get('/api/push/vapid', auth, (req, res) => res.json({ key: VAPID?.publicKey || null }));
app.post('/api/push/sub', auth, (req, res) => {
  const s = req.body?.sub;
  if (!s?.endpoint || !s?.keys?.auth || !s?.keys?.p256dh) return res.status(400).json({ error: 'invalid' });
  store.addPush(req.user.id, s);
  res.json({ ok: true });
});

app.get('/api/letters', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.letters(req.user.pair_id).map(l => ({ ...l, mine: l.user_id === req.user.id })));
});
app.post('/api/letter', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  const title = String(req.body?.title || '').slice(0, 60).trim();
  const text = String(req.body?.text || '').slice(0, 4000).trim();
  if (!text) return res.status(400).json({ error: 'invalid' });
  store.addLetter(req.user.pair_id, req.user.id, title, text);
  io.to(req.user.pair_id).emit('letter:new', { from: req.user.name });
  pushPartner(req.user, { title: '💌 Ryora Watch', body: `${req.user.name} nulis surat buat kamu`, tag: 'letter' });
  res.json({ ok: true });
});
app.delete('/api/letter/:id', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'invalid' });
  store.delLetter(req.user.pair_id, req.params.id, req.user.id);
  res.json({ ok: true });
});

// --- AI ---
app.post('/api/ai/chat', auth, async (req, res) => {
  const partner = req.user.pair_id ? store.partnerOf(req.user) : null;
  const week = Date.now() - 7 * 86400000;
  const msg = (req.body?.message || '').slice(0, 500);
  const ctx = {
    user: req.user, partner,
    schedules: req.user.pair_id ? store.schedules(req.user.pair_id) : [],
    loc: partner ? store.latestLoc(partner.id) : null,
    myLoc: store.latestLoc(req.user.id),
    pairCreatedAt: req.user.pair_id ? store.pairOf(req.user.id)?.created_at : null,
    missSent: req.user.pair_id ? store.missCount(req.user.pair_id, req.user.id, week) : 0,
    missRecv: partner ? store.missCount(req.user.pair_id, partner.id, week) : 0,
    aiName: req.user.ai_name,
    aiGender: req.user.ai_gender,
    facts: store.facts(req.user.id),
    history: store.chatHistory(req.user.id, 12),
  };
  // "ingat/inget ya ..." → simpan fakta soal user biar AI beneran ingat
  const mem = msg.match(/^(?:ingat|inget|tolong ingat|catet|catat)\s*(?:in|ya)?\s*(?:kalau|kalo)?\s*(?:aku|gw|gue)?\s*(.+)/i);
  if (mem && mem[1]?.trim().length > 3) {
    const fact = mem[1].trim();
    store.addFact(req.user.id, fact);
    const r = { reply: `Oke noted, aku ingat ya — ${fact.replace(/[.!]+$/, '')} 📝 bakal aku inget terus!`, source: 'memory' };
    store.addChatMsg(req.user.id, 'user', msg);
    store.addChatMsg(req.user.id, 'model', r.reply);
    return res.json(r);
  }
  const r = await aiChat(req.user, partner, ctx.schedules, ctx, msg);
  if (msg.trim() && r.reply) {
    store.addChatMsg(req.user.id, 'user', msg);
    store.addChatMsg(req.user.id, 'model', r.reply);
  }
  res.json(r);
});

app.get('/api/ai/history', auth, (req, res) => {
  res.json(store.chatFull(req.user.id, 60));
});

// --- Sockets ---
const online = new Map(); // userId -> socketId
const batt = new Map();   // userId -> battery %
const lastMiss = new Map();
const touching = new Set(); // userId yang lagi tahan sentuh
const suitPicks = new Map(); // pairId -> {userId: {hand, ts}}
const TOD_TRUTH = [
  'Hal pertama yang bikin kamu jatuh cinta sama dia?',
  'Kebiasaan dia yang diam-diam kamu gemesin?',
  'Kapan terakhir kamu bohong ke dia? Tentang apa?',
  'Hal yang paling pengen kamu denger dari dia?',
  'Momen paling malu bareng dia?',
  'Kalau bisa ubah 1 hal dari dia, apa?',
  'Cerita masa kecil yang belum pernah kamu ceritain?',
  'Hal yang bikin kamu paling insecure di hubungan ini?',
  'Mimpi teraneh yang pernah kamu alamin tentang dia?',
  'Hal paling romantis yang pernah dia lakuin menurutmu?',
  'Kalau hubungan kalian film, judulnya apa?',
  'Apa yang paling kamu takutin soal masa depan kalian?',
  'Kapan kamu paling kangen dia? Ceritain momennya.',
  'Hal kecil dari dia yang selalu bikin kamu senyum?',
  'Kalau bisa hidup di mana aja bareng dia, di mana?',
];
const TOD_DARE = [
  'Kirim 💓 sekarang juga — langsung, jangan mikir!',
  'Kirim voice note nyanyiin 1 baris lagu favorit!',
  'Kirim foto ekspresi paling random kamu sekarang!',
  'Bikin catatan manis buat dia di Home sekarang!',
  'Sebutin 3 hal yang kamu sayang dari dia — sekarang!',
  'Kirim 🤗 peluk virtual + bilang sesuatu yang manis!',
  'Ganti status kamu jadi pujian buat dia selama sehari!',
  'Kirim foto langit di tempatmu sekarang!',
  'Ajak dia video call atau telpon sekarang kalau bisa!',
  'Bikin jadwal date spontan buat minggu ini!',
  'Jawab pertanyaan harian dengan jawaban paling jujur!',
  'Kirim foto makanan terakhir yang kamu makan!',
  'Bilang "aku sayang kamu" pakai bahasa daerahmu!',
  'Kirim emoji yang paling menggambarkan dia + alasannya!',
  'Dance 10 detik sekarang — dia harus percaya kamu! 🕺',
];

io.use((socket, next) => {
  const u = store.userByToken(socket.handshake.auth?.token);
  if (!u) return next(new Error('unauthorized'));
  socket.user = u; next();
});

io.on('connection', (socket) => {
  const u = socket.user;
  online.set(u.id, socket.id);
  if (u.pair_id) {
    socket.join(u.pair_id);
    socket.to(u.pair_id).emit('partner:status', { online: true });
  }

  socket.on('location:update', ({ lat, lng }) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    store.setLoc(u.id, lat, lng);
    if (u.pair_id) socket.to(u.pair_id).emit('location:update', { lat, lng, ts: Date.now() });
  });

  socket.on('battery:update', ({ level }) => {
    if (typeof level !== 'number') return;
    batt.set(u.id, Math.round(level));
    if (u.pair_id) socket.to(u.pair_id).emit('partner:battery', { level: Math.round(level) });
  });

  socket.on('miss:send', ({ pattern = 1 }) => {
    if (!u.pair_id) return;
    const now = Date.now();
    if (now - (lastMiss.get(u.id) || 0) < 10000) return; // rate limit 10dtk
    lastMiss.set(u.id, now);
    store.addMiss(u.pair_id, u.id, Math.min(Math.max(pattern | 0, 1), 5));
    const roomSize = io.sockets.adapter.rooms.get(u.pair_id)?.size || 0;
    console.log(`[miss] ${u.name} → room ${u.pair_id} (${roomSize} sockets)`);
    socket.to(u.pair_id).emit('miss:receive', { from: u.name, pattern, ts: now });
    socket.emit('miss:sent');
    pushPartner(u, { title: '💓 Ryora Watch', body: `${u.name} kangen kamu${pattern > 1 ? ` ×${pattern}` : ''}`, tag: 'miss' });
  });

  socket.on('care:send', ({ kind }) => {
    if (!u.pair_id) return;
    const now = Date.now();
    if (now - (lastMiss.get('c' + u.id) || 0) < 8000) return;
    lastMiss.set('c' + u.id, now);
    const kind2 = String(kind).slice(0, 20);
    socket.to(u.pair_id).emit('care:receive', { from: u.name, kind: kind2 });
    const labels = { makan: '🍚 "Udah makan belum?"', minum: '💧 "Minum air ya!"', peluk: '🤗 peluk virtual', tidur: '😴 "Istirahat dulu ya"' };
    pushPartner(u, { title: '💓 Ryora Watch', body: `${u.name}: ${labels[kind2] || kind2}`, tag: 'care' });
  });

  socket.on('touch:start', () => {
    if (!u.pair_id) return;
    touching.add(u.id);
    const partner = store.partnerOf(u);
    socket.to(u.pair_id).emit('touch:partner', { on: true });
    if (partner && touching.has(partner.id)) io.to(u.pair_id).emit('touch:match');
  });
  socket.on('touch:end', () => {
    touching.delete(u.id);
    if (u.pair_id) socket.to(u.pair_id).emit('touch:partner', { on: false });
  });

  // --- adu suit realtime (in-memory per pair) ---
  socket.on('suit:pick', ({ hand }) => {
    if (!u.pair_id || !['✊', '✋', '✌️'].includes(hand)) return;
    const cur = suitPicks.get(u.pair_id) || {};
    cur[u.id] = { hand, ts: Date.now() };
    suitPicks.set(u.pair_id, cur);
    const partner = store.partnerOf(u);
    if (partner && cur[partner.id] && Date.now() - cur[partner.id].ts < 120000) {
      const a = cur[u.id].hand, b = cur[partner.id].hand;
      const beats = (x, y) => (x === '✊' && y === '✌️') || (x === '✋' && y === '✊') || (x === '✌️' && y === '✋');
      const winner = a === b ? 'draw' : beats(a, b) ? u.id : partner.id;
      store.suitAdd(u.pair_id, winner);
      io.to(u.pair_id).emit('suit:result', {
        winner, names: { [u.id]: u.name, [partner.id]: partner.name },
        picks: { [u.id]: a, [partner.id]: b },
      });
      suitPicks.delete(u.pair_id);
    } else {
      socket.to(u.pair_id).emit('suit:invite', { from: u.name });
    }
  });

  // --- truth or dare ---
  socket.on('tod:request', ({ mode }) => {
    if (!u.pair_id) return;
    const now = Date.now();
    if (now - (lastMiss.get('t' + u.id) || 0) < 3000) return;
    lastMiss.set('t' + u.id, now);
    const list = mode === 'dare' ? TOD_DARE : TOD_TRUTH;
    const text = list[Math.floor(Math.random() * list.length)];
    io.to(u.pair_id).emit('tod:card', { mode: mode === 'dare' ? 'dare' : 'truth', text, from: u.name });
  });

  // --- nobar sync — countdown bareng di dua HP ---
  socket.on('nobar:start', () => {
    if (!u.pair_id) return;
    const now = Date.now();
    if (now - (lastMiss.get('n' + u.id) || 0) < 10000) return;
    lastMiss.set('n' + u.id, now);
    io.to(u.pair_id).emit('nobar:go', { from: u.name, at: now + 4000 });
    pushPartner(u, { title: '🎬 Ryora Watch', body: `${u.name} ngajak nobar — gas!`, tag: 'nobar' });
  });

  // --- "lagi apa?" — minta foto live dari pasangan ---
  socket.on('photo:request', () => {
    if (!u.pair_id) return;
    const now = Date.now();
    if (now - (lastMiss.get('pr' + u.id) || 0) < 20000) return;
    lastMiss.set('pr' + u.id, now);
    socket.to(u.pair_id).emit('photo:ask', { from: u.name });
    pushPartner(u, { title: '📸 Ryora Watch', body: `${u.name} mau lihat kamu lagi apa — kirim foto!`, tag: 'photoask' });
  });

  // --- fokus bareng — timer sinkron di dua HP ---
  socket.on('focus:start', ({ dur }) => {
    if (!u.pair_id) return;
    const now = Date.now();
    if (now - (lastMiss.get('f' + u.id) || 0) < 30000) return;
    lastMiss.set('f' + u.id, now);
    const mins = [15, 25, 45, 60].includes(+dur) ? +dur : 25;
    io.to(u.pair_id).emit('focus:go', { from: u.name, at: now + 3000, dur: mins * 60000 });
    pushPartner(u, { title: '⏱️ Ryora Watch', body: `${u.name} ngajak fokus bareng ${mins} menit!`, tag: 'focus' });
  });

  socket.on('disconnect', () => {
    online.delete(u.id);
    touching.delete(u.id);
    store.setLastSeen(u.id);
    if (u.pair_id) socket.to(u.pair_id).emit('partner:status', { online: false, lastSeen: Date.now() });
  });
});

http.listen(PORT, () => console.log(`Ryora Watch → http://localhost:${PORT}`));
