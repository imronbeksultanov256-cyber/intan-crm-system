# 🦷 Intan Dental Clinic — Система управления

Полноценная система управления стоматологической клиникой с CRM, электронными картами пациентов, расписанием, прайс-листом и финансовой аналитикой.

## Быстрый старт

```bash
cd backend
npm install
cp .env.example .env
# Заполните .env (DB_PASSWORD, JWT_SECRET)
node src/utils/migrate.js
node src/utils/seed.js
npm run dev
```

Откройте: **http://localhost:3001/admin**

| Логин | Пароль | Роль |
|-------|--------|------|
| chief@intan.kg | demo123 | Главный врач |
| doctor@intan.kg | demo123 | Врач |
| admin@intan.kg | demo123 | Администратор |

## Полная инструкция

📖 См. файл **[INSTALLATION.md](./INSTALLATION.md)**

## Стек технологий

- **Backend**: Node.js + Express + JWT + RBAC
- **Database**: PostgreSQL
- **Frontend**: Vanilla JS SPA (без фреймворков, быстро)
- **Уведомления**: Telegram Bot API
- **Экспорт**: PDF (pdfkit) + Excel (ExcelJS)
