# 🦷 Инструкция по установке — Система управления клиникой «Интан»

---

## Содержание
1. [Требования к серверу](#1-требования)
2. [Установка PostgreSQL](#2-postgresql)
3. [Установка Node.js](#3-nodejs)
4. [Загрузка проекта](#4-загрузка-проекта)
5. [Настройка переменных окружения](#5-env)
6. [Инициализация базы данных](#6-база-данных)
7. [Запуск системы](#7-запуск)
8. [Первый вход](#8-первый-вход)
9. [Настройка Telegram-уведомлений](#9-telegram)
10. [Деплой на сервер (Ubuntu/VPS)](#10-продакшн)
11. [Решение проблем](#11-проблемы)

---

## 1. Требования

| Компонент | Версия |
|-----------|--------|
| Node.js   | 18+ LTS |
| PostgreSQL | 14+ |
| ОС        | Ubuntu 22.04 / Windows 10+ / macOS 12+ |
| RAM       | минимум 1 GB |
| Диск      | минимум 5 GB свободно |

---

## 2. Установка PostgreSQL

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Запустить службу
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Создать базу данных
sudo -u postgres psql -c "CREATE DATABASE intan_clinic;"
sudo -u postgres psql -c "CREATE USER intan_user WITH PASSWORD 'StrongPass123!';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE intan_clinic TO intan_user;"
sudo -u postgres psql -c "ALTER USER intan_user CREATEDB;"
```

### Windows
1. Скачайте установщик: https://www.postgresql.org/download/windows/
2. Установите (версия 15 или 16)
3. Запомните пароль пользователя `postgres`
4. После установки откройте **pgAdmin** или **psql Shell**:
```sql
CREATE DATABASE intan_clinic;
CREATE USER intan_user WITH PASSWORD 'StrongPass123!';
GRANT ALL PRIVILEGES ON DATABASE intan_clinic TO intan_user;
```

### macOS
```bash
# через Homebrew
brew install postgresql@16
brew services start postgresql@16

createdb intan_clinic
psql intan_clinic -c "CREATE USER intan_user WITH PASSWORD 'StrongPass123!';"
psql intan_clinic -c "GRANT ALL PRIVILEGES ON DATABASE intan_clinic TO intan_user;"
```

---

## 3. Установка Node.js

### Ubuntu
```bash
# Установка Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Windows
1. Скачайте с https://nodejs.org/ → кнопка **LTS**
2. Запустите установщик, нажимайте Next
3. Откройте **cmd** или **PowerShell** и проверьте:
```
node --version
npm --version
```

### macOS
```bash
brew install node@20
```

---

## 4. Загрузка проекта

### Вариант A — скопировать папку на сервер (SCP / FTP)
Скопируйте папку `intan-clinic` на сервер в любое место, например `/home/ubuntu/intan-clinic`

### Вариант B — Git
```bash
git clone https://github.com/your-repo/intan-clinic.git
cd intan-clinic
```

### Установка зависимостей
```bash
cd intan-clinic/backend
npm install
```

---

## 5. Настройка переменных окружения (.env)

```bash
# Из папки backend/
cp .env.example .env
nano .env          # или любой текстовый редактор
```

Заполните файл `.env`:

```env
# ── СЕРВЕР ─────────────────────────────
PORT=3001
NODE_ENV=production

# ── БАЗА ДАННЫХ ─────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=intan_clinic
DB_USER=intan_user
DB_PASSWORD=StrongPass123!

# ── JWT (ОБЯЗАТЕЛЬНО поменяйте!) ────────
JWT_SECRET=vasha_ochen_dlinnaya_i_slozhnaya_stroka_minimum_64_simvola_XYZ789abc
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# ── ЗАГРУЗКА ФАЙЛОВ ─────────────────────
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=20

# ── TELEGRAM (опционально) ──────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ── CORS ───────────────────────────────
FRONTEND_URL=http://localhost:3001
```

> ⚠️ **ВАЖНО**: `JWT_SECRET` должен быть длинной случайной строкой.
> Сгенерируйте командой: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## 6. Инициализация базы данных

```bash
# Находясь в папке intan-clinic/backend/

# Шаг 1: Применить схему (создать таблицы)
node src/utils/migrate.js

# Шаг 2: Загрузить тестовые данные (пользователи, услуги, пациенты)
node src/utils/seed.js
```

Вы должны увидеть:
```
✅ Schema applied successfully

✓ User: chief@intan.kg
✓ User: doctor@intan.kg
✓ User: admin@intan.kg
✓ 26 services added
✓ 5 sample patients added

Login credentials (password: demo123):
  chief@intan.kg  — Главный врач
  doctor@intan.kg — Врач
  admin@intan.kg  — Администратор
```

---

## 7. Запуск системы

### Режим разработки (с автоперезагрузкой)
```bash
cd intan-clinic/backend
npm run dev
```

### Режим продакшн
```bash
cd intan-clinic/backend
npm start
```

Сервер запустится: **http://localhost:3001**
Панель управления: **http://localhost:3001/admin**

---

## 8. Первый вход

Откройте браузер и перейдите на:
```
http://localhost:3001/admin
```

| Логин | Пароль | Роль |
|-------|--------|------|
| chief@intan.kg | demo123 | Главный врач — полный доступ |
| doctor@intan.kg | demo123 | Врач — мед. данные |
| admin@intan.kg | demo123 | Администратор — записи |

> 🔐 **После первого входа обязательно смените пароли!**
> Главный врач может управлять сотрудниками в разделе «Сотрудники».

---

## 9. Telegram-уведомления (опционально)

### Создание бота
1. Напишите [@BotFather](https://t.me/BotFather) в Telegram
2. Команда `/newbot`
3. Введите имя бота: `Интан Клиника`
4. Получите **токен**: `123456789:ABCdefGHIjklMNO...`

### Получение Chat ID
1. Добавьте бота в нужный чат или напишите ему лично
2. Перейдите: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Найдите поле `"chat":{"id": XXXXXXXXX}` — это ваш Chat ID

### Добавьте в .env
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNO...
TELEGRAM_CHAT_ID=123456789
```

Перезапустите сервер. Теперь при каждой онлайн-записи придёт уведомление в Telegram.

---

## 10. Деплой на VPS-сервер (Ubuntu)

### Установка PM2 (менеджер процессов)
```bash
sudo npm install -g pm2

# Запустить приложение
cd /home/ubuntu/intan-clinic/backend
pm2 start src/server.js --name "intan-clinic"

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save
```

### Полезные команды PM2
```bash
pm2 status               # Статус приложений
pm2 logs intan-clinic    # Просмотр логов
pm2 restart intan-clinic # Перезапуск
pm2 stop intan-clinic    # Остановка
```

### Настройка Nginx (обратный прокси)
```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/intan
```

Содержимое файла:
```nginx
server {
    listen 80;
    server_name ваш-домен.kg;   # или IP сервера

    client_max_body_size 25M;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias /home/ubuntu/intan-clinic/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/intan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL-сертификат (HTTPS) бесплатно
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.kg
```

---

## 11. Структура папок

```
intan-clinic/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js      # Авторизация, JWT
│   │   │   ├── patientsController.js  # CRUD пациентов
│   │   │   ├── appointmentsController.js  # Записи, слоты
│   │   │   ├── servicesController.js  # Прайс-лист, PDF
│   │   │   └── financeController.js   # Финансы, Excel
│   │   ├── middleware/
│   │   │   └── auth.js               # JWT + RBAC
│   │   ├── routes/
│   │   │   └── api.js                # Все API маршруты
│   │   ├── utils/
│   │   │   ├── db.js                 # PostgreSQL pool
│   │   │   ├── migrate.js            # Применение схемы
│   │   │   ├── seed.js               # Тестовые данные
│   │   │   ├── notifications.js      # Telegram уведомления
│   │   │   └── cron.js               # Планировщик задач
│   │   └── server.js                 # Express сервер
│   ├── .env.example
│   └── package.json
├── frontend/
│   └── admin/
│       ├── index.html                # SPA оболочка
│       ├── css/
│       │   └── admin.css             # Design system
│       └── js/
│           ├── api.js                # HTTP клиент
│           ├── ui.js                 # UI утилиты + навигация
│           ├── admin.js              # Инициализация приложения
│           └── pages/
│               ├── dashboard.js      # Дашборд + статистика
│               ├── appointments.js   # Управление записями
│               ├── patients.js       # CRM пациентов
│               ├── services.js       # Прайс-лист
│               └── finance.js        # Финансы + аналитика
└── database/
    └── schema.sql                    # PostgreSQL схема
```

---

## 12. API маршруты (справочник)

| Метод | URL | Доступ | Описание |
|-------|-----|--------|----------|
| POST | /api/auth/login | Все | Вход в систему |
| POST | /api/auth/refresh | Все | Обновление токена |
| GET  | /api/auth/me | Авторизован | Профиль текущего пользователя |
| GET  | /api/dashboard | Авторизован | Сводка дашборда |
| GET  | /api/patients | Авторизован | Список пациентов |
| POST | /api/patients | Врач/Главный | Создать пациента |
| GET  | /api/patients/:id | Авторизован | Карточка пациента |
| PUT  | /api/patients/:id | Врач/Главный | Обновить пациента |
| POST | /api/patients/:id/files | Врач/Главный | Загрузить файл |
| GET  | /api/appointments | Авторизован | Список записей |
| POST | /api/appointments | Авторизован | Создать запись |
| PATCH| /api/appointments/:id/status | Авторизован | Изменить статус |
| GET  | /api/appointments/slots | Авторизован | Свободные слоты |
| POST | /api/book | Публичный | Онлайн-запись с сайта |
| GET  | /api/services | Публичный | Прайс-лист |
| POST | /api/services | Главный врач | Добавить услугу |
| PUT  | /api/services/:id | Главный врач | Изменить цену |
| GET  | /api/services/export/pdf | Авторизован | PDF прайс-лист |
| GET  | /api/doctors | Публичный | Список врачей |
| GET  | /api/finance/dashboard | Главный врач | Финансовая статистика |
| GET  | /api/finance/payments | Главный врач | Список платежей |
| POST | /api/finance/payments | Гл.врач/Адм | Добавить платёж |
| GET  | /api/finance/export/excel | Главный врач | Excel отчёт |
| GET  | /api/users | Главный врач | Список сотрудников |
| POST | /api/users | Главный врач | Создать сотрудника |
| GET  | /api/logs | Главный врач | Журнал действий |

---

## Проблемы и решения

### ❌ Cannot connect to PostgreSQL
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Решение:**
```bash
sudo systemctl status postgresql    # Проверить статус
sudo systemctl start postgresql     # Запустить
```

### ❌ password authentication failed
**Решение:** Проверьте DB_PASSWORD в файле `.env`.  
Windows: пароль задаётся при установке PostgreSQL.

### ❌ PORT 3001 already in use
```bash
# Linux/macOS
kill -9 $(lsof -ti:3001)
# Windows
netstat -ano | findstr :3001
taskkill /PID <число> /F
```

### ❌ Module not found
```bash
cd intan-clinic/backend
rm -rf node_modules
npm install
```

### ❌ JWT_SECRET не задан
Убедитесь, что файл `.env` существует в папке `backend/` и содержит строку `JWT_SECRET=...`

---

## Поддержка и обновление

### Резервное копирование базы данных
```bash
# Создать бэкап
pg_dump -U intan_user intan_clinic > backup_$(date +%Y%m%d).sql

# Восстановить
psql -U intan_user intan_clinic < backup_20240101.sql
```

### Автоматический бэкап (добавить в crontab)
```bash
crontab -e
# Добавить строку (бэкап каждый день в 02:00):
0 2 * * * pg_dump -U intan_user intan_clinic > /backups/intan_$(date +\%Y\%m\%d).sql
```

---

*Система управления клиникой «Интан» — г. Ош, Кыргызстан*
