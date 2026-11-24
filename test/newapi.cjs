const B = 'http://localhost:3000';
const post = (p, b, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b || {}) }).then(r => r.json());
const get = (p, t) => fetch(B + p, { headers: { 'x-token': t } }).then(r => r.json());
(async () => {
  const ua = await post('/api/register', { name: 'QA' });
  const ub = await post('/api/register', { name: 'QB' });
  const pc = await post('/api/pair/create', {}, ua.token);
  await post('/api/pair/join', { code: pc.code }, ub.token);
  // pin
  console.log('pin:', await post('/api/pin', { name: 'first date', lat: -6.2, lng: 106.8 }, ua.token));
  const pins = await get('/api/pins', ub.token);
  console.log('pins B lihat:', pins.length, '|', pins[0]?.name, 'mine:', pins[0]?.mine);
  // quiz — A isi, B nebak
  console.log('quiz set:', await post('/api/quiz', { answers: ['nasi goreng', 'disapa pagi', 'jalan ke jepang'] }, ua.token));
  const qb = await get('/api/quiz', ub.token);
  console.log('B lihat quiz:', qb.qs[0], '| answers leaked?', qb.theirs?.answers);
  const g = await post('/api/quiz/guess', { guesses: ['nasi goreng', 'dipuji', 'ke jepang'] }, ub.token);
  console.log('guess ok:', g.ok, '| jawaban asli:', g.answers?.[0]);
  const qa = await get('/api/quiz', ua.token);
  console.log('A lihat tebakan B:', qa.mine?.theirGuesses?.[0]);
  // scores
  console.log('scores:', await get('/api/scores/week', ua.token));
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
