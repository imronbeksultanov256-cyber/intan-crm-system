const { query } = require('../utils/db');

// ══════════════════════════════════════════════════════════
// GET /api/doctors — список всех врачей (все пользователи с ролью врач)
// ══════════════════════════════════════════════════════════
exports.list = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         u.id as user_id, u.first_name, u.last_name, u.middle_name, u.email, u.phone, u.is_active,
         d.id, COALESCE(d.specialization, 'Врач-стоматолог') as specialization, 
         d.experience_years, d.photo_url, d.rating, d.cabinet
       FROM users u
       JOIN doctors d ON d.user_id = u.id
       WHERE u.role_id = 2 AND u.is_active = TRUE
       ORDER BY u.last_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[doctors.list]', err.message);
    res.status(500).json({ error: 'Ошибка при получении списка врачей' });
  }
};

// ══════════════════════════════════════════════════════════
// GET /api/doctors/:id — профиль врача + график
// ══════════════════════════════════════════════════════════
exports.get = async (req, res) => {
  const { id } = req.params;
  try {
    const doctor = await query(
      `SELECT 
         u.id as user_id, u.first_name, u.last_name, u.middle_name, u.email, u.phone, u.is_active,
         d.id, COALESCE(d.specialization, 'Врач-стоматолог') as specialization, 
         d.experience_years, d.education, d.bio, d.photo_url, d.certificates, 
         d.achievements, d.is_visible, d.cabinet, d.rating
       FROM doctors d
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [id]
    );
    
    if (!doctor.rows[0]) return res.status(404).json({ error: 'Врач не найден' });

    const schedule = await query(
      'SELECT * FROM doctor_schedule WHERE doctor_id = $1 ORDER BY day_of_week',
      [id]
    );

    res.json({
      ...doctor.rows[0],
      schedule: schedule.rows
    });
  } catch (err) {
    console.error('[doctors.get]', err.message);
    res.status(500).json({ error: 'Ошибка при получении данных врача' });
  }
};

// ══════════════════════════════════════════════════════════
// PUT /api/doctors/:id — обновить профиль
// ══════════════════════════════════════════════════════════
exports.update = async (req, res) => {
  const { id } = req.params;
  const {
    specialization, experience_years, education, bio,
    photo_url, certificates, achievements, is_visible,
    cabinet, phone, rating
  } = req.body;

  try {
    const result = await query(
      `UPDATE doctors SET
         specialization   = COALESCE($1, specialization),
         experience_years = COALESCE($2, experience_years),
         education        = $3,
         bio              = $4,
         photo_url        = $5,
         certificates     = $6,
         achievements     = $7,
         is_visible       = COALESCE($8, is_visible),
         cabinet          = $9,
         phone            = $10,
         rating           = $11,
         updated_at       = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        specialization, experience_years, education, bio,
        photo_url, certificates, achievements, is_visible,
        cabinet, phone, rating, id
      ]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Врач не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[doctors.update]', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении профиля врача' });
  }
};

// ══════════════════════════════════════════════════════════
// PUT /api/doctors/:id/schedule — обновить график
// ══════════════════════════════════════════════════════════
exports.updateSchedule = async (req, res) => {
  const { id } = req.params;
  const { schedule } = req.body; // Array of {day_of_week, start_time, end_time, is_working}

  if (!Array.isArray(schedule)) {
    return res.status(400).json({ error: 'График должен быть массивом' });
  }

  try {
    // Начинаем транзакцию
    await query('BEGIN');

    // Удаляем старый график
    await query('DELETE FROM doctor_schedule WHERE doctor_id = $1', [id]);

    // Вставляем новый
    for (const s of schedule) {
      await query(
        `INSERT INTO doctor_schedule (doctor_id, day_of_week, start_time, end_time, is_working)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, s.day_of_week, s.start_time, s.end_time, s.is_working !== false]
      );
    }

    await query('COMMIT');
    res.json({ success: true, message: 'График обновлен' });
  } catch (err) {
    await query('ROLLBACK');
    console.error('[doctors.updateSchedule]', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении графика' });
  }
};

// ══════════════════════════════════════════════════════════
// GET /api/doctors/:id/stats — статистика врача
// ══════════════════════════════════════════════════════════
exports.stats = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Проверяем существование врача
    const check = await query('SELECT id FROM doctors WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Врач не найден' });

    // 2. Сводная статистика
    const stats = await query(
      `SELECT
         (SELECT COUNT(*) FROM appointments WHERE doctor_id = $1 AND status = 'completed') as total_completed,
         (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id = $1) as unique_patients,
         (SELECT COALESCE(SUM(p.amount), 0) FROM payments p 
          LEFT JOIN treatment_records tr ON tr.id = p.treatment_record_id 
          WHERE (tr.doctor_id = $1 OR p.received_by = (SELECT user_id FROM doctors WHERE id = $1)) 
            AND p.status = 'paid') as total_revenue
      `,
      [id]
    );

    // 3. Выручка по месяцам (последние 6 месяцев)
    const monthlyRevenue = await query(
      `SELECT 
         TO_CHAR(COALESCE(p.paid_at, p.created_at), 'YYYY-MM') as month,
         SUM(p.amount) as revenue
       FROM payments p
       LEFT JOIN treatment_records tr ON tr.id = p.treatment_record_id
       WHERE (tr.doctor_id = $1 OR p.received_by = (SELECT user_id FROM doctors WHERE id = $1))
         AND p.status = 'paid'
       GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
      [id]
    );

    res.json({
      summary: stats.rows[0] || { total_completed: 0, unique_patients: 0, total_revenue: 0 },
      monthlyRevenue: monthlyRevenue.rows || []
    });
  } catch (err) {
    console.error('[doctors.stats] ERROR:', err.message);
    res.status(500).json({ error: 'Ошибка при получении статистики врача: ' + err.message });
  }
};
