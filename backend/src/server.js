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

// ── ОБНОВЛЕННЫЙ CORS (УНИВЕРСАЛЬНАЯ ПРОВЕРКА) ───────────────────────────────
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://intan-crm-system-g6e9.vercel.app',
  'https://intan-crm-system.vercel.app'
];

app.use(cors({
  origin: function(origin, callback) {
    // 1. Разрешаем запросы без origin (например, инструменты тестирования)
    if (!origin) return callback(null, true);
    
    // 2. Разрешаем, если домен есть в списке ИЛИ если это любой поддомен vercel.app
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

// Явно обрабатываем предварительные (preflight) OPTIONS запросы
app.options('*', cors());
// ────────────────────────────────────────────────────────────────────────────

// Явно обрабатываем предварительные (preflight) OPTIONS запросы
app.options('*', cors());
// ────────────────────────────────────────────────────────────────────────────

// !!! ВАЖНО: Парсеры JSON перенесены НАВЕРХ, строго до любых лимитеров !!!
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Настройка лимитеров частоты запросов
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 300,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', limiter);
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 20 }));

// Раздача статических файлов
app.use('/uploads', express.static(path.resolve(uploadDir)));
app.use('/admin',   express.static(path.resolve(__dirname, '../../frontend/admin')));
app.use(express.static(path.resolve(__dirname, '../../frontend/public')));

// Подключение основных роутов API
app.use('/api', require('./routes/api'));

// Проверка работоспособности (Health Check)
app.get('/health', (req, res) => res.json({
  status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV,
}));

// Добавлено: Обработка корневого маршрута (чтобы по прямой ссылке не было 404)
app.get('/', (req, res) => res.json({
  message: 'Intan Clinic API успешно запущен и работает!',
  docs: '/api',
  health: '/health'
}));

app.get('/admin/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/admin/index.html'));
});

// Если ни один маршрут не подошел
app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

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

// ── KEEP ALIVE ДЛЯ БЕСПЛАТНОГО ТАРИФА RENDER ────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || 'https://intan-backend.onrender.com';
  
  setInterval(async () => {
    try {
      const fetchModule = global.fetch || require('node-fetch');
      await fetchModule(`${BACKEND_URL}/health`);
      console.log('[KeepAlive] ping OK');
    } catch (e) {
      console.warn('[KeepAlive] ping failed:', e.message);
    }
  }, 10 * 60 * 1000);
}
// ────────────────────────────────────────────────────────────────────────────

module.exports = app;