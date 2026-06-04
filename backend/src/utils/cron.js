const cron = require('node-cron');
const { sendDailyReport, processReminders } = require('./notifications');
const { query } = require('./db');

function startCronJobs() {
  // ── Daily report at 20:00 ──────────────────────────────
  cron.schedule('0 20 * * *', async () => {
    console.log('[CRON] Sending daily report...');
    await sendDailyReport();
  }, { timezone: 'Asia/Bishkek' });

  // ── Check reminders every 5 minutes ───────────────────
  cron.schedule('*/5 * * * *', async () => {
    await processReminders();
  });

  // ── Clean old activity logs (keep 90 days) ─────────────
  cron.schedule('0 3 * * 0', async () => {
    try {
      const r = await query(
        `DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '90 days'`
      );
      console.log(`[CRON] Cleaned ${r.rowCount} old log entries`);
    } catch (err) {
      console.warn('[CRON] Log cleanup error:', err.message);
    }
  });

  console.log('⏰ Cron jobs started');
}

module.exports = { startCronJobs };
