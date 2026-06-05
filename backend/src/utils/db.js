const { Pool } = require('pg');
require('dotenv').config();

let poolConfig = {};
const isProduction = process.env.NODE_ENV === 'production';
let connectionString = process.env.DATABASE_URL || process.env.database_url;

if (connectionString) {
  console.log('📦 [Database]: Обнаружена строка DATABASE_URL. Настраиваем подключение...');
  
  // Для стабильности Neon на Render добавляем параметры совместимости libpq, если их нет в строке
  if (isProduction && !connectionString.includes('sslmode=')) {
    const separator = connectionString.includes('?') ? '&' : '?';
    connectionString += `${separator}sslmode=require&uselibpqcompat=true`;
  }

  poolConfig = {
    connectionString: connectionString,
    ssl: isProduction ? { rejectUnauthorized: false } : false
  };
} else {
  console.log('💻 [Database]: Работаем локально...');
  poolConfig = {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'intan_clinic',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '123',
    ssl: false
  };
}

// 🔥 КРИТИЧЕСКИЕ НАСТРОЙКИ ДЛЯ НЕОН (чтобы пул не падал от Connection terminated unexpectedly)
poolConfig.max = isProduction ? 4 : 10; // На бесплатном тарифе Neon лимит всего 20 соединений на ВСЮ базу. Ставим максимум 4.
poolConfig.idleTimeoutMillis = 15000;   // Закрывать неактивные соединения быстрее (через 15 сек), чтобы Neon их не обрывал принудительно
poolConfig.connectionTimeoutMillis = 10000;

const pool = new Pool(poolConfig);

// Безопасный перехват ошибок пула — теперь приложение НЕ упадет, если Neon сбросит сессию
pool.on('error', (err) => {
  if (err.message.includes('Connection terminated unexpectedly')) {
    console.info('🔄 [Database Pool]: Переподключение закрытого сервером соединения.');
  } else {
    console.error('🚨 Unexpected PostgreSQL pool error:', err.message);
  }
});

const query = async (text, params) => {
  const start = Date.now();
  try {
    return await pool.query(text, params);
  } catch (dbErr) {
    console.error('❌ Ошибка выполнения SQL-запроса:', dbErr.message);
    throw dbErr; // пробрасываем ошибку дальше в контроллер
  } finally {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 100) {
      console.warn(`⏳ Slow query (${duration}ms):`, text.slice(0, 80));
    }
  }
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };