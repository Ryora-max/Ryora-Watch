import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';

mkdirSync('data', { recursive: true });
const db = new DatabaseSync('data/couple.db');

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
`);

try { db.exec('ALTER TABLE users ADD COLUMN ai_enabled INTEGER DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN mood TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN last_seen INTEGER'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN ai_name TEXT'); } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN ai_gender TEXT'); } catch {}

const id = () => randomBytes(8).toString('hex');
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const code = () => Array.from({ length: 3 }, () => ALPHA[randomInt(ALPHA.length)]).join('') + '-' + Array.from({ length: 3 }, () => ALPHA[randomInt(ALPHA.length)]).join('');

export const store = {
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
  partnerOf: (user) => db.prepare('SELECT id,name,mood,last_seen FROM users WHERE pair_id=? AND id!=?').get(user.pair_id, user.id),

  addSchedule: (s) => { db.prepare('INSERT INTO schedules (id,pair_id,title,note,start_time,end_time,notify,created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run(s.id || id(), s.pair_id, s.title, s.note || null, s.start, s.end || null, s.notify ? 1 : 0, s.by || null); },
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

  breakPairAll: (pairId) => {
    db.prepare('DELETE FROM notes WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM answers WHERE pair_id=?').run(pairId);
    db.prepare('DELETE FROM photos WHERE pair_id=?').run(pairId);
  },
};
