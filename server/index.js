import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { store } from './store.js';
import { aiChat } from './ai.js';

const app = express();
const http = createServer(app);
const io = new Server(http);
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '3mb' }));
app.use(express.static('public'));

const auth = (req, res, next) => {
  const u = store.userByToken(req.headers['x-token']);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  req.user = u; next();
};

// --- Auth & Pairing ---
app.post('/api/register', (req, res) => {
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
  res.json({ user: { id: req.user.id, name: req.user.name, ai_enabled: !!req.user.ai_enabled, mood: req.user.mood, ai_name: req.user.ai_name, ai_gender: req.user.ai_gender }, pair, partner, online: partner ? online.has(partner.id) : false, partnerBattery: partner ? (batt.get(partner.id) ?? null) : null, partnerLastSeen: partner?.last_seen ?? null });
});

app.post('/api/ai/toggle', auth, (req, res) => {
  store.setAi(req.user.id, !!req.body?.on);
  res.json({ ok: true });
});

app.post('/api/mood', auth, (req, res) => {
  const mood = String(req.body?.mood || '').slice(0, 8);
  store.setMood(req.user.id, mood);
  if (req.user.pair_id) io.to(req.user.pair_id).emit('partner:mood', { mood, uid: req.user.id });
  res.json({ ok: true });
});

// --- Schedules ---
app.get('/api/schedules', auth, (req, res) => {
  if (!req.user.pair_id) return res.json([]);
  res.json(store.schedules(req.user.pair_id));
});
app.post('/api/schedules', auth, (req, res) => {
  const { title, note, start, end, notify } = req.body || {};
  if (!req.user.pair_id || !title || !start) return res.status(400).json({ error: 'invalid' });
  store.addSchedule({ pair_id: req.user.pair_id, title: title.slice(0, 80), note, start, end, notify, by: req.user.id });
  io.to(req.user.pair_id).emit('schedules:changed');
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
  res.json({
    q: todayQ(),
    myAnswer: mine,
    theirAnswer: mine ? (ans.find(a => a.user_id === partner.id)?.text || null) : null, // reveal hanya setelah kamu jawab
    myNote: store.noteOf(req.user.id)?.text || '',
    theirNote: store.noteOf(partner.id)?.text || '',
    photos: pho.map(p => ({ mine: p.user_id === req.user.id, img: p.img, caption: p.caption, ts: p.ts })),
    streak: store.missStreak(req.user.pair_id),
  });
});

app.post('/api/note', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  store.setNote(req.user.id, req.user.pair_id, String(req.body?.text || '').slice(0, 200));
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

app.post('/api/daily/answer', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  store.setAnswer(req.user.pair_id, dayKey(), req.user.id, String(req.body?.text || '').slice(0, 300));
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

app.post('/api/photo', auth, (req, res) => {
  if (!req.user.pair_id) return res.status(400).json({ error: 'no pair' });
  const img = String(req.body?.img || '');
  if (!img.startsWith('data:image/') || img.length > 400000) return res.status(400).json({ error: 'gambar terlalu besar' });
  store.setPhoto(req.user.pair_id, dayKey(), req.user.id, img, String(req.body?.caption || '').slice(0, 100));
  io.to(req.user.pair_id).emit('home:changed');
  res.json({ ok: true });
});

app.post('/api/ai/prefs', auth, (req, res) => {
  const { name, gender } = req.body || {};
  if (name !== undefined) store.setAiName(req.user.id, String(name).trim().slice(0, 20) || null);
  if (gender === 'cowo' || gender === 'cewe') store.setAiGender(req.user.id, gender);
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
    history: store.chatHistory(req.user.id, 12),
  };
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
  });

  socket.on('disconnect', () => {
    online.delete(u.id);
    store.setLastSeen(u.id);
    if (u.pair_id) socket.to(u.pair_id).emit('partner:status', { online: false, lastSeen: Date.now() });
  });
});

http.listen(PORT, () => console.log(`Ryora Watch → http://localhost:${PORT}`));
