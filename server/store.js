import Database from 'libsql';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

mkdirSync('data', { recursive: true });
// Embedded replica: SQLite lokal yang auto-sync ke Turso — data selamat walau server restart/redeploy.
// Tanpa TURSO_URL → file lokal biasa (dev).
const useTurso = !!process.env.TURSO_URL;
const db = new Database(useTurso ? 'data/replica.db' : 'data/couple.db', useTurso ? {
  syncUrl: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN || '',
  syncInterval: 60,
} : {});
if (useTurso) {
  try { await db.sync(); console.log('[db] sync awal Turso OK'); } catch (e) { console.log('[db] sync awal gagal:', e.message); }
  setInterval(async () => { try { await db.sync(); } catch (e) { console.log('[db] sync:', e.message); } }, 60000);
  const flush = async () => { try { await db.sync(); } catch {} process.exit(0); };
  process.on('SIGTERM', flush); process.on('SIGINT', flush);
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, pair_id TEXT,
  token TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pairs (
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY, pair_id TEXT NOT NULL, title TEXT NOT NULL,
  note TEXT, start_time INTEGER NOT NULL, end_time INTEGER,
  notify INTEGER DEFAULT 1, created_by TEXT
);
CREATE TABLE IF NOT EXISTS latest_loc (
  user_id TEXT PRIMARY KEY, lat REAL, lng REAL, ts INTEGER
);
CREATE TABLE IF NOT EXISTS loc_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, lat REAL, lng REAL, ts INTEGER
);
CREATE TABLE IF NOT EXISTS miss_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pair_id TEXT, from_user TEXT,
  pattern INTEGER DEFAULT 1, ts INTEGER
);
CREATE TABLE IF NOT EXISTS chat_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT,
  role TEXT, text TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS notes (
  user_id TEXT PRIMARY KEY, pair_id TEXT, text TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS answers (
  pair_id TEXT, day TEXT, user_id TEXT, text TEXT, ts INTEGER,
  PRIMARY KEY (pair_id, day, user_id)
);
CREATE TABLE IF NOT EXISTS photos (
  pair_id TEXT, day TEXT, user_id TEXT, img TEXT, caption TEXT, ts INTEGER,
  PRIMARY KEY (pair_id, day, user_id)
);
CREATE TABLE IF NOT EXISTS bucket (
  id TEXT PRIMARY KEY, pair_id TEXT, text TEXT,
  done INTEGER DEFAULT 0, created_by TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, pair_id TEXT, user_id TEXT,
  img TEXT, caption TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS voices (
  id TEXT PRIMARY KEY, pair_id TEXT, user_id TEXT,
  audio TEXT, dur INTEGER, ts INTEGER
);
CREATE TABLE IF NOT EXISTS reactions (
  pair_id TEXT, target_type TEXT, target_id TEXT, user_id TEXT,
  emoji TEXT, ts INTEGER,
  PRIMARY KEY (pair_id, target_type, target_id, user_id)
);
CREATE TABLE IF NOT EXISTS ai_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, fact TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS suit_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pair_id TEXT, winner_id TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS mood_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, pair_id TEXT, mood TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS push_subs (
  user_id TEXT, endpoint TEXT PRIMARY KEY, auth TEXT, p256dh TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, pair_id TEXT, user_id TEXT, title TEXT, text TEXT, ts INTEGER
);
CREATE TABLE IF NOT EXISTS capsules (
  id TEXT PRIMARY KEY, pair_id TEXT, user_id TEXT,
  text TEXT, unlock_ts INTEGER, ts INTEGER
);
CREATE TABLE IF NOT EXISTS pins (
  id TEXT PRIMARY KEY, pair_id TEXT, user_id TEXT, name TEXT, lat REAL, lng REAL, ts INTEGER
);
CREATE TABLE IF NOT EXISTS quiz (
  id TEXT PRIMARY KEY, pair_id TEXT, day TEXT, user_id TEXT, answers TEXT, ts INTEGER,
  UNIQUE(pair_id, day, user_id)
);
CREATE TABLE IF NOT EXISTS quiz_guesses (
  quiz_id TEXT, user_id TEXT, guesses TEXT, ts INTEGER, PRIMARY KEY(quiz_id, user_id)
);
`);

try { db.exec('ALTER TABLE users ADD COLUMN ai_enabled INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN mood TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN ai_name TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN ai_gender TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN status TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN pet_name TEXT'); } catch {}
try { db.exec('ALTER TABLE pairs ADD COLUMN next_meet INTEGER'); } catch {}
try { db.exec('ALTER TABLE pairs ADD COLUMN since INTEGER'); } catch {}
try { db.exec('ALTER TABLE pairs ADD COLUMN song TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN bday TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN dnd_from INTEGER'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN dnd_to INTEGER'); } catch {}
try { db.exec('ALTER TABLE suit_results ADD COLUMN game TEXT DEFAULT "suit"'); } catch {}
try { db.exec('ALTER TABLE schedules ADD COLUMN repeat TEXT'); } catch {}
db.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');

// Migrasi sekali: impor semua tabel dari couple.db lama (node:sqlite) ke replica Turso.
// ATTACH tidak didukung di embedded replica → baca lewat koneksi libsql biasa.
if (useTurso && existsSync('data/couple.db') && !existsSync('data/.migrated')) {
  try {
    const old = new Database('data/couple.db');
    const tables = old.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    let moved = 0;
    for (const t of tables) {
      try {
        const cols = old.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
        const rows = old.prepare(`SELECT * FROM "${t}"`).all();
        if (!cols.length || !rows.length) continue;
        const stmt = db.prepare(`INSERT OR IGNORE INTO "${t}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
        for (const r of rows) stmt.run(...cols.map(c => r[c]));
        moved += rows.length;
      } catch (e) { console.log(`[db] tabel ${t} skip:`, e.message); }
    }
    old.close();
    writeFileSync('data/.migrated', new Date().toISOString());
    console.log(`[db] migrasi OK — ${moved} baris dari ${tables.length} tabel`);
    try { await db.sync(); } catch (e) { console.log('[db] sync migrasi:', e.message); }
  } catch (e) { console.log('[db] migrasi gagal:', e.message); }
}

const id = () => randomBytes(8).toString('hex');
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const code = () => Array.from({ length: 3 }, () => ALPHA[randomInt(ALPHA.length)]).join('') + '-' + Array.from({ length: 3 }, () => ALPHA[randomInt(ALPHA.length)]).join('');

export const store = {
  kvGet: (k) => db.prepare('SELECT v FROM kv WHERE k=?').get(k)?.v,
  kvSet: (k, v) => db.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, v),
  createUser: (name) => {
    const u = { id: id(), name, token: randomBytes(24).toString('hex'), ts: Date.now() };
    db.prepare('INSERT INTO users (id,name,token,created_at) VALUES (?,?,?,?)').run(u.id, name, u.token, u.ts);
    return u;
  },
  userByToken: (t) => db.prepare('SELECT * FROM users WHERE token=?').get(t),
  userById: (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id),
  setAi: (uid, on) => db.prepare('UPDATE users SET ai_enabled=? WHERE id=?').run(on ? 1 : 0, uid),
  setMood: (uid, mood) => db.prepare('UPDATE users SET mood=? WHERE id=?').run(mood, uid),
  setLastSeen: (uid, ts) => db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(ts || Date.now(), uid),
  setAiName: (uid, name) => db.prepare('UPDATE users SET ai_name=? WHERE id=?').run(name, uid),
  setAiGender: (uid, g) => db.prepare('UPDATE users SET ai_gender=? WHERE id=?').run(g, uid),
  setStatus: (uid, s) => db.prepare('UPDATE users SET status=? WHERE id=?').run(s, uid),
  setProfile: (uid, { name, avatar, pet_name, bday, dnd_from, dnd_to }) => {
    if (name != null) db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).trim().slice(0, 30), uid);
    if (avatar != null) db.prepare('UPDATE users SET avatar=? WHERE id=?').run(String(avatar).slice(0, 200000), uid);
    if (pet_name != null) db.prepare('UPDATE users SET pet_name=? WHERE id=?').run(String(pet_name).trim().slice(0, 30), uid);
    if (bday != null) db.prepare('UPDATE users SET bday=? WHERE id=?').run(String(bday).slice(0, 10), uid);
    if (dnd_from !== undefined) db.prepare('UPDATE users SET dnd_from=? WHERE id=?').run(dnd_from === null ? null : +dnd_from, uid);
    if (dnd_to !== undefined) db.prepare('UPDATE users SET dnd_to=? WHERE id=?').run(dnd_to === null ? null : +dnd_to, uid);
  },
  setNextMeet: (pairId, ts) => db.prepare('UPDATE pairs SET next_meet=? WHERE id=?').run(ts, pairId),
  setSince: (pairId, ts) => db.prepare('UPDATE pairs SET since=? WHERE id=?').run(ts, pairId),
  setSong: (pairId, s) => db.prepare('UPDATE pairs SET song=? WHERE id=?').run(String(s || '').slice(0, 80), pairId),
  capsules: (pairId) => db.prepare('SELECT c.*, u.name from_name FROM capsules c JOIN users u ON u.id=c.user_id WHERE c.pair_id=? ORDER BY c.unlock_ts').all(pairId),
  addCapsule: (pairId, uid, text, unlock_ts) => db.prepare('INSERT INTO capsules (id,pair_id,user_id,text,unlock_ts,ts) VALUES (?,?,?,?,?,?)').run(id(), pairId, uid, text, unlock_ts, Date.now()),
  delCapsule: (pairId, cid, uid) => db.prepare('DELETE FROM capsules WHERE pair_id=? AND id=? AND user_id=?').run(pairId, cid, uid),

  addChatMsg: (uid, role, text) => db.prepare('INSERT INTO chat_msgs (user_id,role,text,ts) VALUES (?,?,?,?)').run(uid, role, text, Date.now()),
  chatHistory: (uid, limit = 12) => db.prepare('SELECT role,text FROM chat_msgs WHERE user_id=? ORDER BY id DESC LIMIT ?').all(uid, limit).reverse(),
  chatFull: (uid, limit = 50) => db.prepare('SELECT role,text,ts FROM chat_msgs WHERE user_id=? ORDER BY id DESC LIMIT ?').all(uid, limit).reverse(),

  createPair: (userId) => {
    const p = { id: id(), code: code(), ts: Date.now() };
    db.prepare('INSERT INTO pairs (id,code,created_at) VALUES (?,?,?)').run(p.id, p.code, p.ts);
    db.prepare('UPDATE users SET pair_id=? WHERE id=?').run(p.id, userId);
    return p;
  },
  joinPair: (userId, pairCode) => {
    const clean = String(pairCode).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const p = db.prepare("SELECT * FROM pairs WHERE replace(code,'-','')=? AND status='waiting'").get(clean);
    if (!p) return null;
    // Kode kedaluwarsa setelah 24 jam
    if (Date.now() - p.created_at > 86400000) {
      db.prepare("UPDATE pairs SET status='expired' WHERE id=?").run(p.id);
      db.prepare('UPDATE users SET pair_id=NULL WHERE pair_id=?').run(p.id);
      return 'expired';
    }
    // Seal hanya jika tepat 1 member (pembuat) — cegah self-join & race double-join
    const r = db.prepare("UPDATE pairs SET status='sealed' WHERE id=? AND status='waiting' AND (SELECT COUNT(*) FROM users WHERE pair_id=?)=1").run(p.id, p.id);
    if (!r.changes) return null;
    db.prepare('UPDATE users SET pair_id=? WHERE id=?').run(p.id, userId);
    return { ...p, status: 'sealed' };
  },
  breakPair: (pairId) => {
    db.prepare('UPDATE users SET pair_id=NULL WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM schedules WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM miss_events WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM pairs WHERE id=?').run(pairId);
    store.breakPairAll?.(pairId);
  },
  pairOf: (userId) => db.prepare('SELECT p.* FROM pairs p JOIN users u ON u.pair_id=p.id WHERE u.id=?').get(userId),
  partnerOf: (user) => db.prepare('SELECT id,name,avatar,mood,last_seen,status,bday FROM users WHERE pair_id=? AND id!=?').get(user.pair_id, user.id),

  addSchedule: (s) => { db.prepare('INSERT INTO schedules (id,pair_id,title,note,start_time,end_time,notify,created_by,repeat) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(s.id || id(), s.pair_id, s.title, s.note || null, s.start, s.end || null, s.notify ? 1 : 0, s.by || null, s.repeat || null); },
  schedules: (pairId) => db.prepare('SELECT * FROM schedules WHERE pair_id=? ORDER BY start_time').all(pairId),
  delSchedule: (pairId, sid) => db.prepare('DELETE FROM schedules WHERE pair_id=? AND id=?').run(pairId, sid),

  setLoc: (uid, lat, lng) => {
    db.prepare('INSERT INTO latest_loc VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,ts=excluded.ts').run(uid, lat, lng, Date.now());
    db.prepare('INSERT INTO loc_pings (user_id,lat,lng,ts) VALUES (?,?,?,?)').run(uid, lat, lng, Date.now());
    db.prepare('DELETE FROM loc_pings WHERE ts < ?').run(Date.now() - 86400000);
  },
  trail: (uid, sinceMs) => db.prepare('SELECT lat,lng,ts FROM loc_pings WHERE user_id=? AND ts>? ORDER BY ts').all(uid, sinceMs),
  latestLoc: (uid) => db.prepare('SELECT * FROM latest_loc WHERE user_id=?').get(uid),

  addMiss: (pairId, fromUser, pattern) => db.prepare('INSERT INTO miss_events (pair_id,from_user,pattern,ts) VALUES (?,?,?,?)').run(pairId, fromUser, pattern, Date.now()),
  missCount: (pairId, uid, sinceMs) => db.prepare('SELECT COUNT(*) c FROM miss_events WHERE pair_id=? AND from_user=? AND ts>?').get(pairId, uid, sinceMs).c,
  missHistory: (pairId, limit = 30) => db.prepare('SELECT m.*, u.name AS from_name FROM miss_events m LEFT JOIN users u ON u.id=m.from_user WHERE m.pair_id=? ORDER BY m.ts DESC LIMIT ?').all(pairId, limit),
  missStreak: (pairId) => {
    const rows = db.prepare('SELECT ts FROM miss_events WHERE pair_id=? ORDER BY ts DESC LIMIT 1000').all(pairId);
    const days = new Set(rows.map(r => new Date(r.ts).toDateString()));
    let streak = 0; const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    return streak;
  },

  setNote: (uid, pairId, text) => db.prepare('INSERT INTO notes (user_id,pair_id,text,ts) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET text=excluded.text,ts=excluded.ts').run(uid, pairId, text, Date.now()),
  noteOf: (uid) => db.prepare('SELECT text,ts FROM notes WHERE user_id=?').get(uid),

  setAnswer: (pairId, day, uid, text) => db.prepare('INSERT INTO answers (pair_id,day,user_id,text,ts) VALUES (?,?,?,?,?) ON CONFLICT(pair_id,day,user_id) DO UPDATE SET text=excluded.text,ts=excluded.ts').run(pairId, day, uid, text, Date.now()),
  answers: (pairId, day) => db.prepare('SELECT user_id,text,ts FROM answers WHERE pair_id=? AND day=?').all(pairId, day),

  setPhoto: (pairId, day, uid, img, caption) => db.prepare('INSERT INTO photos (pair_id,day,user_id,img,caption,ts) VALUES (?,?,?,?,?,?) ON CONFLICT(pair_id,day,user_id) DO UPDATE SET img=excluded.img,caption=excluded.caption,ts=excluded.ts').run(pairId, day, uid, img, caption, Date.now()),
  photos: (pairId, day) => db.prepare('SELECT user_id,img,caption,ts FROM photos WHERE pair_id=? AND day=?').all(pairId, day),

  bucket: (pairId) => db.prepare('SELECT * FROM bucket WHERE pair_id=? ORDER BY done, ts').all(pairId),
  addBucket: (pairId, text, by) => db.prepare('INSERT INTO bucket (id,pair_id,text,created_by,ts) VALUES (?,?,?,?,?)').run(id(), pairId, text, by, Date.now()),
  setBucketDone: (pairId, bid, done) => db.prepare('UPDATE bucket SET done=? WHERE pair_id=? AND id=?').run(done ? 1 : 0, pairId, bid),
  delBucket: (pairId, bid) => db.prepare('DELETE FROM bucket WHERE pair_id=? AND id=?').run(pairId, bid),
  photosSince: (pairId, dayKey) => db.prepare('SELECT COUNT(*) c FROM photos WHERE pair_id=? AND day>=?').get(pairId, dayKey).c,
  answersSince: (pairId, dayKey) => db.prepare('SELECT COUNT(*) c FROM answers WHERE pair_id=? AND day>=?').get(pairId, dayKey).c,
  memories: (pairId, limit = 60) => db.prepare('SELECT m.*, u.name AS from_name FROM memories m LEFT JOIN users u ON u.id=m.user_id WHERE m.pair_id=? ORDER BY m.ts DESC LIMIT ?').all(pairId, limit),
  addMemory: (pairId, uid, img, caption) => db.prepare('INSERT INTO memories (id,pair_id,user_id,img,caption,ts) VALUES (?,?,?,?,?,?)').run(id(), pairId, uid, img, caption, Date.now()),
  delMemory: (pairId, mid, uid) => db.prepare('DELETE FROM memories WHERE pair_id=? AND id=? AND user_id=?').run(pairId, mid, uid),
  voices: (pairId, limit = 20) => db.prepare('SELECT v.*, u.name AS from_name FROM voices v LEFT JOIN users u ON u.id=v.user_id WHERE v.pair_id=? ORDER BY v.ts DESC LIMIT ?').all(pairId, limit),
  addVoice: (pairId, uid, audio, dur) => {
    db.prepare('INSERT INTO voices (id,pair_id,user_id,audio,dur,ts) VALUES (?,?,?,?,?,?)').run(id(), pairId, uid, audio, dur, Date.now());
    db.prepare('DELETE FROM voices WHERE pair_id=? AND id NOT IN (SELECT id FROM voices WHERE pair_id=? ORDER BY ts DESC LIMIT 20)').run(pairId, pairId);
  },
  delVoice: (pairId, vid, uid) => db.prepare('DELETE FROM voices WHERE pair_id=? AND id=? AND user_id=?').run(pairId, vid, uid),
  setReaction: (pairId, type, tid, uid, emoji) => {
    if (emoji) db.prepare('INSERT OR REPLACE INTO reactions (pair_id,target_type,target_id,user_id,emoji,ts) VALUES (?,?,?,?,?,?)').run(pairId, type, tid, uid, emoji, Date.now());
    else db.prepare('DELETE FROM reactions WHERE pair_id=? AND target_type=? AND target_id=? AND user_id=?').run(pairId, type, tid, uid);
  },
  reactionsFor: (pairId, type, tid) => db.prepare('SELECT user_id, emoji FROM reactions WHERE pair_id=? AND target_type=? AND target_id=?').all(pairId, type, tid),
  exportPair: (pairId) => ({
    schedules: db.prepare('SELECT title,note,start_time,end_time FROM schedules WHERE pair_id=?').all(pairId),
    notes: db.prepare('SELECT user_id,text,ts FROM notes WHERE pair_id=?').all(pairId),
    answers: db.prepare('SELECT day,user_id,text,ts FROM answers WHERE pair_id=?').all(pairId),
    photos: db.prepare('SELECT day,user_id,img,caption,ts FROM photos WHERE pair_id=?').all(pairId),
    memories: db.prepare('SELECT user_id,img,caption,ts FROM memories WHERE pair_id=?').all(pairId),
    voices: db.prepare('SELECT user_id,audio,dur,ts FROM voices WHERE pair_id=?').all(pairId),
    bucket: db.prepare('SELECT text,done,ts FROM bucket WHERE pair_id=?').all(pairId),
    miss_events: db.prepare('SELECT from_user,pattern,ts FROM miss_events WHERE pair_id=?').all(pairId),
  }),
  facts: (uid, limit = 20) => db.prepare('SELECT fact FROM ai_facts WHERE user_id=? ORDER BY ts DESC LIMIT ?').all(uid, limit).map(r => r.fact),
  addFact: (uid, fact) => {
    db.prepare('INSERT INTO ai_facts (user_id,fact,ts) VALUES (?,?,?)').run(uid, fact.slice(0, 160), Date.now());
    db.prepare('DELETE FROM ai_facts WHERE user_id=? AND id NOT IN (SELECT id FROM ai_facts WHERE user_id=? ORDER BY ts DESC LIMIT 30)').run(uid, uid);
  },
  feed: (pairId, limit = 30) => {
    const rows = [];
    const push = (type, uid, text, ts) => rows.push({ type, uid, text, ts });
    db.prepare('SELECT from_user uid, pattern, ts FROM miss_events WHERE pair_id=? ORDER BY ts DESC LIMIT 20').all(pairId).forEach(r => push('miss', r.uid, '💓 kangen ×' + (r.pattern || 1), r.ts));
    db.prepare('SELECT user_id uid, text, ts FROM notes WHERE pair_id=?').all(pairId).forEach(r => push('note', r.uid, '📝 catatan: "' + (r.text || '').slice(0, 40) + '"', r.ts));
    db.prepare('SELECT user_id uid, day, ts FROM answers WHERE pair_id=? ORDER BY ts DESC LIMIT 15').all(pairId).forEach(r => push('answer', r.uid, '❓ jawab pertanyaan harian', r.ts));
    db.prepare('SELECT user_id uid, caption, ts FROM photos WHERE pair_id=? ORDER BY ts DESC LIMIT 15').all(pairId).forEach(r => push('photo', r.uid, '📸 kirim foto harian', r.ts));
    db.prepare('SELECT user_id uid, caption, ts FROM memories WHERE pair_id=? ORDER BY ts DESC LIMIT 15').all(pairId).forEach(r => push('memory', r.uid, '🖼️ kenangan baru' + (r.caption ? ': "' + r.caption.slice(0, 30) + '"' : ''), r.ts));
    db.prepare('SELECT user_id uid, dur, ts FROM voices WHERE pair_id=? ORDER BY ts DESC LIMIT 10').all(pairId).forEach(r => push('voice', r.uid, '🎤 pesan suara ' + r.dur + 'd', r.ts));
    db.prepare('SELECT text, done, created_by uid, ts FROM bucket WHERE pair_id=? ORDER BY ts DESC LIMIT 10').all(pairId).forEach(r => push('bucket', r.uid, (r.done ? '🪣✅ ' : '🪣 impian baru: ') + r.text.slice(0, 30), r.ts));
    return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
  },
  addPush: (uid, sub) => db.prepare('INSERT OR REPLACE INTO push_subs (user_id,endpoint,auth,p256dh,ts) VALUES (?,?,?,?,?)').run(uid, sub.endpoint, sub.keys.auth, sub.keys.p256dh, Date.now()),
  delPush: (endpoint) => db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(endpoint),
  pushFor: (uid) => db.prepare('SELECT * FROM push_subs WHERE user_id=?').all(uid),
  letters: (pairId) => db.prepare('SELECT l.*, u.name from_name FROM letters l JOIN users u ON u.id=l.user_id WHERE l.pair_id=? ORDER BY l.ts DESC LIMIT 50').all(pairId),
  addLetter: (pairId, uid, title, text) => db.prepare('INSERT INTO letters (pair_id,user_id,title,text,ts) VALUES (?,?,?,?,?)').run(pairId, uid, title, text, Date.now()),
  delLetter: (pairId, id, uid) => db.prepare('DELETE FROM letters WHERE pair_id=? AND id=? AND user_id=?').run(pairId, id, uid),
  logMood: (uid, pairId, mood) => {
    db.prepare('INSERT INTO mood_log (user_id,pair_id,mood,ts) VALUES (?,?,?,?)').run(uid, pairId, mood, Date.now());
    db.prepare('DELETE FROM mood_log WHERE user_id=? AND ts<?').run(uid, Date.now() - 30 * 86400000);
  },
  moodWeek: (pairId, since) => db.prepare('SELECT user_id, mood, ts FROM mood_log WHERE pair_id=? AND ts>? ORDER BY ts').all(pairId, since),
  suitAdd: (pairId, winnerId, game = 'suit') => db.prepare('INSERT INTO suit_results (pair_id,winner_id,game,ts) VALUES (?,?,?,?)').run(pairId, winnerId, game, Date.now()),
  suitStats: (pairId) => db.prepare('SELECT winner_id, COUNT(*) n FROM suit_results WHERE pair_id=? GROUP BY winner_id').all(pairId),
  scoreWeek: (pairId, since) => db.prepare('SELECT game, winner_id, COUNT(*) n FROM suit_results WHERE pair_id=? AND ts>? GROUP BY game, winner_id').all(pairId, since),

  // --- tempat favorit ---
  addPin: (pairId, uid, name, lat, lng) => { db.prepare('INSERT INTO pins (id,pair_id,user_id,name,lat,lng,ts) VALUES (?,?,?,?,?,?,?)').run(id(), pairId, uid, name, lat, lng, Date.now()); },
  pins: (pairId) => db.prepare('SELECT p.*, u.name by_name FROM pins p JOIN users u ON u.id=p.user_id WHERE p.pair_id=? ORDER BY p.ts DESC').all(pairId),
  delPin: (pairId, pinId, uid) => db.prepare('DELETE FROM pins WHERE pair_id=? AND id=? AND user_id=?').run(pairId, pinId, uid),

  // --- quiz kenal ---
  quizGet: (pairId, day, uid) => db.prepare('SELECT q.*, u.name by_name FROM quiz q JOIN users u ON u.id=q.user_id WHERE q.pair_id=? AND q.day=? AND q.user_id=?').get(pairId, day, uid),
  quizSet: (pairId, day, uid, answers) => db.prepare('INSERT INTO quiz (id,pair_id,day,user_id,answers,ts) VALUES (?,?,?,?,?,?) ON CONFLICT(pair_id,day,user_id) DO UPDATE SET answers=excluded.answers, ts=excluded.ts').run(id(), pairId, day, uid, JSON.stringify(answers), Date.now()),
  quizGuessSet: (quizId, uid, guesses) => db.prepare('INSERT INTO quiz_guesses (quiz_id,user_id,guesses,ts) VALUES (?,?,?,?) ON CONFLICT(quiz_id,user_id) DO UPDATE SET guesses=excluded.guesses, ts=excluded.ts').run(quizId, uid, JSON.stringify(guesses), Date.now()),
  quizGuessGet: (quizId, uid) => db.prepare('SELECT * FROM quiz_guesses WHERE quiz_id=? AND user_id=?').get(quizId, uid),
  activityDays: (pairId, since) => {
    const days = {};
    const add = ts => { const d = new Date(ts).toDateString(); days[d] = (days[d] || 0) + 1; };
    const q = (sql) => db.prepare(sql).all(pairId, since).forEach(r => add(r.ts));
    q('SELECT ts FROM miss_events WHERE pair_id=? AND ts>?');
    q('SELECT ts FROM answers WHERE pair_id=? AND ts>?');
    q('SELECT ts FROM photos WHERE pair_id=? AND ts>?');
    q('SELECT ts FROM memories WHERE pair_id=? AND ts>?');
    q('SELECT ts FROM voices WHERE pair_id=? AND ts>?');
    q('SELECT ts FROM notes WHERE pair_id=? AND ts>?');
    q('SELECT ts FROM bucket WHERE pair_id=? AND ts>?');
    return days;
  },
  monthStats: (pairId, since) => ({
    miss: db.prepare('SELECT COUNT(*) c FROM miss_events WHERE pair_id=? AND ts>=?').get(pairId, since).c,
    miss_by: db.prepare('SELECT from_user, COUNT(*) c FROM miss_events WHERE pair_id=? AND ts>=? GROUP BY from_user').all(pairId, since),
    photos: db.prepare('SELECT COUNT(*) c FROM photos WHERE pair_id=? AND ts>=?').get(pairId, since).c,
    memories: db.prepare('SELECT COUNT(*) c FROM memories WHERE pair_id=? AND ts>=?').get(pairId, since).c,
    voices: db.prepare('SELECT COUNT(*) c FROM voices WHERE pair_id=? AND ts>=?').get(pairId, since).c,
    schedules: db.prepare('SELECT COUNT(*) c FROM schedules WHERE pair_id=? AND start_time>=?').get(pairId, since).c,
    answers: db.prepare("SELECT COUNT(DISTINCT day) c FROM answers WHERE pair_id=? AND day>=?").get(pairId, new Date(since).toISOString().slice(0, 10)).c,
    bucket_done: db.prepare('SELECT COUNT(*) c FROM bucket WHERE pair_id=? AND done=1').get(pairId).c,
  }),

  breakPairAll: (pairId) => {
    db.prepare('DELETE FROM notes WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM answers WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM photos WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM bucket WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM memories WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM voices WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM reactions WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM capsules WHERE pair_id=?').run(pairId);
  },
};
