const { Pool } = require('pg');
require('dotenv').config();

let poolConfig = {};

// 1. Проверяем режим работы приложения
const isProduction = process.env.NODE_ENV === 'production';

// 2. Ищем строку подключения (проверяем оба регистра на всякий случай)
const connectionString = process.env.DATABASE_URL || process.env.database_url;

if (connectionString) {
  console.log('📦 [Database]: Обнаружена строка DATABASE_URL. Подключаемся к удаленной БД...');
  poolConfig = {
    connectionString: connectionString,
    // На Render для Neon ОБЯЗАТЕЛЬНО нужен ssl в продакшене
    ssl: isProduction ? { rejectUnauthorized: false } : false
  };
} else {
  // Если мы на Render, но строки нет — это критическая ошибка
  if (isProduction) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Переменная DATABASE_URL не найдена в окружении production!');
  }
  
  console.log('💻 [Database]: Строка DATABASE_URL не найдена. Переключаемся на локальные параметры...');
  poolConfig = {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'intan_clinic',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '123',
    ssl: false
  };
}

// Добавляем общие лимиты для пула
poolConfig.max = 20;
poolConfig.idleTimeoutMillis = 30000;
poolConfig.connectionTimeoutMillis = 10000; // Немного увеличим для стабильности при «холодном старте»

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('🚨 Unexpected PostgreSQL pool error:', err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development' && duration > 100) {
    console.warn(`⏳ Slow query (${duration}ms):`, text.slice(0, 80));
  }
  return res;
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
