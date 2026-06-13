require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');

const app = express();
app.set('trust proxy', 1);

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://intan-crm-system-g6e9.vercel.app',
  'https://imronbeksultanov256-cyber.github.io',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.warn('CORS заблокировал origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

// ── PARSERS ───────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── RATE LIMIT ────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 300,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', limiter);
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 20 }));

// ── STATIC ────────────────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(uploadDir)));
app.use('/admin',   express.static(path.resolve(__dirname, '../../frontend/admin')));
app.use(express.static(path.resolve(__dirname, '../../frontend/public')));

// ── ROUTES ────────────────────────────────────────────────────
// ВАЖНО: patients-v2 должен быть ПЕРЕД общим api роутом,
// иначе /api/patients будет перехвачен раньше
app.use('/api/patients', require('./routes/patients-v2'));
app.use('/api',          require('./routes/api'));

// ── SERVICE ROUTES ────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV,
}));

app.get('/', (req, res) => res.json({
  message: 'Intan Clinic API успешно запущен и работает!',
  docs: '/api', health: '/health',
}));

app.get('/admin/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/admin/index.html'));
});

// ── 404 & ERROR HANDLER ───────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ── START ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🦷 Intan Clinic API  →  http://localhost:${PORT}`);
  console.log(`   Admin Panel      →  http://localhost:${PORT}/admin`);
  console.log(`   Environment      →  ${process.env.NODE_ENV || 'development'}\n`);
  if (process.env.NODE_ENV === 'production') {
    const { startCronJobs } = require('./utils/cron');
    startCronJobs();
  }
});

// ── KEEP ALIVE (Render free tier) ─────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || 'https://intan-backend.onrender.com';
  setInterval(async () => {
    try {
      const fetchFn = global.fetch;
      if (fetchFn) {
        await fetchFn(`${BACKEND_URL}/health`);
        console.log('[KeepAlive] ping OK');
      }
    } catch (e) {
      console.warn('[KeepAlive] ping failed:', e.message);
    }
  }, 10 * 60 * 1000);
}

module.exports = app;