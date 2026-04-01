// src/server.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const FRONTEND = path.resolve(__dirname, '../../frontend');

// Serve static assets (css, js, images) from frontend root
app.use(express.static(FRONTEND));

// Serve HTML files directly by name (e.g. /login.html → frontend/html/login.html)
app.use(express.static(path.join(FRONTEND, 'html')));

// API Routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/turfs',    require('./routes/turfs'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/admin',    require('./routes/admin'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// DEBUG: inspect coupons in DB (remove in production)
app.get('/api/debug/coupons', async (_req, res) => {
  try {
    const { Coupon } = require('./db');
    const coupons = await Coupon.find().lean();
    res.json(coupons.map(c => ({ ...c, is_active_type: typeof c.is_active, is_active_value: c.is_active })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SPA fallback — only for non-API, non-asset requests
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `${req.method} ${req.path} not found` });
  }
  res.sendFile(path.join(FRONTEND, 'html', 'login.html'));
});

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║         TurfSphere v3.0 — Running 🏟️            ║
  ║   http://localhost:${PORT}                          ║
  ╠══════════════════════════════════════════════════╣
  ║  Admin  : phone=0000000000  pass=admin123        ║
  ║  Owner  : phone=9999999999  pass=owner123        ║
  ╚══════════════════════════════════════════════════╝
    `);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });

module.exports = app;
