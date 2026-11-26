// AI "SkySea" — teman hidup yang bisa diajak ngobrol apa aja.
// Arsitektur: data faktual (jadwal/lokasi/kangen/cuaca) → jawaban lokal instan.
// Semua obrolan lain → Gemini (dengan riwayat), fallback lokal kalau gagal/lambat.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' mnt lalu';
  return Math.round(m / 60) + ' jam lalu';
};
const dist = (a, b) => {
  const R = 6371e3, r = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
  const m = 2 * R * Math.asin(Math.sqrt(h));
  return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
};

// ---- riwayat obrolan per user (dari DB via ctx, 12 pesan terakhir) ----

// ---- cuaca beneran: Open-Meteo gratis ----
const wcache = new Map();
const wdesc = (c) => c === 0 ? 'cerah ☀️' : c < 3 ? 'cerah berawan ⛅' : c < 50 ? 'berawan ☁️' : c < 60 ? 'gerimis 🌦️' : c < 70 ? 'hujan 🌧️' : c < 80 ? 'berkabut 🌫️' : c < 90 ? 'hujan deras 🌧️' : 'badai ⛈️';
export async function weatherFor(lat, lng) {
  const k = `${lat.toFixed(1)},${lng.toFixed(1)}`, c = wcache.get(k);
  if (c && Date.now() - c.ts < 30 * 60e3) return c.w;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,relative_humidity_2m&timezone=auto`, { signal: AbortSignal.timeout(4000) });
  const j = await r.json();
  const w = { t: Math.round(j.current.temperature_2m), code: j.current.weather_code, hum: j.current.relative_humidity_2m };
  wcache.set(k, { w, ts: Date.now() });
  return w;
}

// ========== DATA FAKTUAL — jawaban instan dari DB/GPS ==========
async function dataReply(ctx, msg) {
  const { user, partner, schedules, loc, myLoc, pairCreatedAt, missSent, missRecv } = ctx;
  const p = partner?.name || 'dia';
  const days = pairCreatedAt ? Math.floor((Date.now() - pairCreatedAt) / 86400000) + 1 : 0;
  const low = msg.toLowerCase().trim();
  const now = Date.now(), today = new Date().toDateString();

  if (/jadwal|agenda|schedule|acara|rencana hari/i.test(low)) {
    const todays = schedules.filter(s => new Date(s.start_time).toDateString() === today);
    if (!todays.length) return `Hari ini jadwal kalian kosong 😌 cocok buat spontan date sama ${p}!`;
    const list = todays.map(s => `${fmt(s.start_time)} ${s.title}`).join(', ');
    const next = schedules.find(s => s.start_time > now - 60000);
    return `Hari ini: ${list} 📅${next ? ` — terdekat ${fmt(next.start_time)}!` : ''}`;
  }
  if (/(dia|pasangan|pacar|pacar(ku|mu)?).*(dimana|di ?mana|lagi apa|lagi ngapain)|(dimana|di ?mana|lokasi|posisi).*(dia|pasangan|pacar)/i.test(low) || /lokasi|posisi terakhir/i.test(low)) {
    if (!partner) return `Pasanganmu belum connect — kirim kode undangan dulu dari halaman awal 💌`;
    if (!loc?.lat) return `Lokasi ${p} belum masuk — suruh dia buka app-nya biar GPS-nya nyala 📍`;
    const d = myLoc?.lat ? `, jarak kalian ${dist(myLoc, loc)}` : '';
    return `${p} terakhir di ${loc.lat.toFixed(4)},${loc.lng.toFixed(4)} (${ago(loc.ts)})${d}. Cek tab 🗺️ buat lihat pin-nya!`;
  }
  if (/berapa (kali|x).*(kangen|miss)|(kangen|miss).*berapa/i.test(low) && partner) {
    const lead = missRecv > missSent ? 'dia lebih kangen kamu hehe' : missSent > missRecv ? 'kamu yang lebih kangen, lucu' : 'imbang — sama-sama kangen';
    return `Minggu ini: kamu ${missSent}x, ${p} ${missRecv}x 💓 ${lead}`;
  }
  if (/hari ke|anniversary|jadian|ultah hubungan|berapa lama|monthsary/i.test(low)) {
    if (!partner) return `Belum ada pasangan yang connect — pairing dulu baru bisa itung hari 💌`;
    return `Kalian udah hari ke-${days} bersama 💕 ${days < 30 ? 'masih anget-angetnya nih!' : 'awww langgeng terus ya!'}`;
  }
  if (/cuaca|suhu|derajat|hujan( deras| deres)?|gerimis|badai|panas banget|gerah|langit/i.test(low)) {
    if (myLoc?.lat) {
      try {
        const w = await weatherFor(myLoc.lat, myLoc.lng);
        return `Di tempat kamu sekarang: ${wdesc(w.code)}, ${w.t}°C, kelembapan ${w.hum}% 🌡️ ${w.code >= 60 ? 'Jangan lupa payung! ☔' : w.t > 31 ? 'Panas poll, minum air terus 🥤' : 'Cuacanya enak~'}`;
      } catch { return `Cuaca-nya lagi susah diakses nih 😅`; }
    }
    return `GPS kamu belum nyala jadi aku belum tahu cuaca di tempatmu 📍 aktifin izin lokasi dulu ya`;
  }
  return null;
}

// ========== GEMINI — otak obrolan utama ==========
const systemPrompt = (c) => `Kamu "${c.aiName || 'teman AI'}", teman hidup ${c.aiGender === 'cowo' ? 'cowok' : 'cewek'} di app LYNX LIFE — app couple buat ${c.user.name}${c.partner ? ` & ${c.partner.name}` : ''}.

GAYA NGOMONG — paling penting: kayak sahabat asli di WhatsApp. Santai banget, hangat, humoris, kadang usil/nyablak, punya pendapat sendiri dan berani beda pendapat. Bahasa gaul Indonesia (aku-kamu, banget, wkwk, gas, ih, sih, dong, nih, btw, vibes, gemes). JANGAN kaku, JANGAN formal, JANGAN bilang "sebagai AI", JANGAN ceramah atau sok bijak.

ATURAN: jawab 1-3 kalimat pendek aja (tampil di layar jam & dibacakan suara). Emoji sewajarnya, nggak tiap kalimat. Nggak wajib nanya balik — kadang cukup reaksi, komentar, atau cerita singkat. Kalau topik serius (berita, sains, politik) jawab yang bener tapi tetap santai. Kalau user curhat: dengar dulu, tanggapi emosional, jangan langsung nasihatin. Jangan pakai markdown/format (tanpa *teks*, **teks**, atau list). Variasikan pembuka tiap jawaban — jangan selalu mulai dengan kata yang sama. Jawabanmu akan dibacakan TTS jadi tulis kayak orang ngomong beneran.

KONTEKS: ${c.partner ? `pasangan ${c.user.name} = ${c.partner.name}. Lokasi ${c.partner.name}: ${c.loc ? `${c.loc.lat.toFixed(4)},${c.loc.lng.toFixed(4)} (${ago(c.loc.ts)})` : 'belum ada'}. Jadwal hari ini: ${c.schedules.map(s => `${fmt(s.start_time)} ${s.title}`).join(', ') || 'kosong'}.` : 'Pasangan belum connect.'}
${c.facts?.length ? `HAL YANG KAMU INGAT TENTANG ${c.user.name.toUpperCase()}: ${c.facts.join('; ')}.` : ''}
Boleh bahas apa aja: curhat, gosip, sekolah, kerja, hobi, film, musik, game, hubungan, nasihat santai, berita, random. Nggak tahu? jawab jujur santai, jangan ngarang.`;

async function gemini(ctx, msg) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const contents = [
    ...(ctx.history || []).map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: msg }] },
  ];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents,
        generationConfig: { maxOutputTokens: 800, temperature: 1.0 },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
    return reply || null;
  } catch { return null; }
}

// ========== FALLBACK LOKAL — kalau Gemini mati/lambat ==========
const NEG = /sedih|capek|cape|bosen|bosan|bete|bt\b|marah|kesel|nangis|kecewa|takut|cemas|khawatir|pusing|sakit|stress|stres|galau|down|mewek|hancur|patah/;
const POS = /senang|bahagia|seru|asyik|keren|mantap|alhamdulillah|akhirnya|yeay|hepi|happy|lega|semangat/;
function fallback(ctx, msg) {
  const { user, partner } = ctx, low = msg.toLowerCase().trim();
  const p = partner?.name || 'dia';
  const h = new Date().getHours(), salam = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 19 ? 'sore' : 'malam';
  if (/^(hai+|halo+|hi+|hei+|hello+|yo|hey|oi)/i.test(low)) return `Hai ${user.name}! 💜 lagi ngapain nih?`;
  if (/^(selamat )?(pagi|siang|sore|malam)/i.test(low)) return `Selamat ${salam}, ${user.name}! ☀️`;
  if (NEG.test(low)) return pick([`Peluk jauh dulu 🤗 cerita dong kenapa?`, `Aduh ${user.name} 🥺 sini cerita, aku dengerin`, `Yang berat pasti berlalu 💪 ${partner ? `${p} juga pasti mau dengerin` : ''}`]);
  if (POS.test(low)) return pick([`Asik! 🎉 cerita dong!`, `Yeay aku ikut seneng 🥳`]);
  if (/kangen/i.test(low)) return `Kangen ya? 🥺 ${partner ? `pencet 💓 aja langsung, ${p} pasti senyum` : 'connect pasanganmu dulu yuk'}`;
  if (/makasih|terima kasih|thanks/i.test(low)) return `Sama-sama ${user.name} 💜`;
  if (/wkwk|wk+|haha+|hehe+|😂|🤣/i.test(low)) return `Wkwkwk ikutan ketawa 🤣`;
  if (/lapar|makan|laper/i.test(low)) return `Lagi laper? 🍜 buruan makan gih, nanti masuk angin`;
  if (/tidur|ngantuk|insomnia|begadang/i.test(low)) return `Ngantuk ya? 😴 tidur gih, jangan begadang terus`;
  if (/film|nonton|series|drakor|anime/i.test(low)) return pick([`Ooh mau nonton apa? spill dong 🎬`, `Film apa nih, penasaran 👀`]);
  if (/lagu|musik|dengerin|playlist/i.test(low)) return pick([`Lagi dengerin apa nih? 🎧`, `Spill playlist dong~`]);
  if (/sayang|cinta|love|cium/i.test(low)) return `Aww 🥰 ${partner ? `sama ${p} kan pasti hehe` : 'so sweet'}`;
  return pick([
    `Hmm menarik! 🤔 terus gimana?`,
    `Oh gitu~ cerita lagi dong 👂`,
    `Iya iya, terus? aku dengerin`,
    `Eh serius? lanjutin lanjutin 👀`,
    `Wkwk random banget, tapi aku suka 😄`,
    `Oke noted! Terus habis itu gimana?`,
  ]);
}

// sapaan proaktif — langsung ke Gemini biar nggak ke-intercept dataReply
export async function aiGreet(ctx, waktu, hint) {
  const msg = `Tulis sapaan selamat ${waktu} buat ${ctx.user.name} — 1-2 kalimat hangat kayak sahabat, boleh sebut: ${hint}. Jangan pakai asterisk atau tanda kurung.`;
  return gemini(ctx, msg);
}

export async function aiChat(user, partner, schedules, ctx, message) {
  const local = await dataReply(ctx, message);
  if (local) return { reply: local, source: 'local' };
  const g = await gemini(ctx, message);
  if (g) return { reply: g, source: 'gemini' };
  return { reply: fallback(ctx, message), source: 'fallback' };
}
