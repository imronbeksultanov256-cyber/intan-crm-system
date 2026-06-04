const axios = require('axios');
const { query } = require('./db');

// ── TELEGRAM ────────────────────────────────────────────────
async function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.warn('Telegram send error:', err.message);
  }
}

// ── NOTIFY NEW APPOINTMENT ──────────────────────────────────
async function notifyNewAppointment(appt) {
  const msg = `
🦷 <b>Новая запись — Клиника Интан</b>

👤 Пациент: ${appt.patient_name}
📞 Телефон: ${appt.patient_phone || '—'}
👨‍⚕️ Врач: ${appt.doctor_name}
📅 Дата: ${new Date(appt.appointment_dt).toLocaleString('ru-RU')}
🔖 Источник: ${appt.source === 'online' ? 'Онлайн-запись' : 'Администратор'}
${appt.comment ? `💬 Комментарий: ${appt.comment}` : ''}
  `.trim();

  await sendTelegram(msg);
}

// ── DAILY REPORT ─────────────────────────────────────────────
async function sendDailyReport() {
  try {
    const stats = await query('SELECT * FROM v_today_stats');
    const s = stats.rows[0];
    if (!s) return;

    const msg = `
📊 <b>Итоги дня — Клиника Интан</b>
${new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}

📅 Записей за день: <b>${s.today_appointments}</b>
✅ Завершено приёмов: <b>${s.today_completed}</b>
👤 Новых пациентов: <b>${s.new_patients_today}</b>
💰 Выручка: <b>${parseInt(s.today_revenue).toLocaleString('ru-RU')} сом</b>
    `.trim();

    await sendTelegram(msg);
  } catch (err) {
    console.warn('Daily report error:', err.message);
  }
}

// ── REMINDER CHECK (run via cron) ───────────────────────────
async function processReminders() {
  try {
    const due = await query(
      `SELECT r.*, p.first_name, p.last_name, p.phone
       FROM reminders r
       JOIN patients p ON p.id = r.patient_id
       WHERE r.remind_at <= NOW() AND r.is_sent = FALSE`
    );

    for (const r of due.rows) {
      if (r.channel === 'telegram') {
        await sendTelegram(`⏰ Напоминание\n👤 ${r.last_name} ${r.first_name} (${r.phone})\n${r.message}`);
      }
      await query('UPDATE reminders SET is_sent = TRUE WHERE id = $1', [r.id]);
    }
  } catch (err) {
    console.warn('Reminder error:', err.message);
  }
}

module.exports = { sendTelegram, notifyNewAppointment, sendDailyReport, processReminders };
