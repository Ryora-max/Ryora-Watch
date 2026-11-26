import { io } from 'socket.io-client';
const r = await fetch('http://localhost:3000/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:'PingT'}) }).then(r=>r.json());
const s = io('http://localhost:3000', { auth: { token: r.token } });
s.on('connect', () => {
  const t0 = Date.now();
  s.emit('time:ping', t0, (srv) => {
    const off = srv - Math.round((t0 + Date.now())/2);
    console.log('ACK OK — server offset:', off, 'ms');
    s.disconnect(); process.exit(0);
  });
  setTimeout(() => { console.log('NO ACK'); process.exit(1); }, 4000);
});
s.on('connect_error', e => { console.log('ERR', e.message); process.exit(1); });
