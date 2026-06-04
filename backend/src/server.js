require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const fs        = require('fs');

const app = express();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3001',
  ],
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 300,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api', limiter);
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 20 }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.resolve(uploadDir)));
app.use('/admin',   express.static(path.resolve(__dirname, '../../frontend/admin')));
app.use(express.static(path.resolve(__dirname, '../../frontend/public')));

app.use('/api', require('./routes/api'));

app.get('/health', (req, res) => res.json({
  status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV,
}));

app.get('/admin/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/admin/index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

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

module.exports = app;
