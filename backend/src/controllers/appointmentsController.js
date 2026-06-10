const { query } = require('../utils/db');

// ── GET /api/appointments ─────────────────────────────────
exports.list = async (req, res) => {
  const {
    date, doctorId, status, page = 1, limit = 50
  } = req.query;

  const offset = (page - 1) * parseInt(limit);
  const conditions = [];
  const params = [];
  let pi = 1;

  // Doctors can only see their own appointments
  if (req.filterDoctorId) {
    conditions.push(`a.doctor_id = $${pi++}`);
    params.push(req.filterDoctorId);
  } else if (doctorId) {
    conditions.push(`a.doctor_id = $${pi++}`);
    params.push(doctorId);
  }

  if (date) {
    conditions.push(`a.appointment_dt::date = $${pi++}`);
    params.push(date);
  }

  if (status) {
    conditions.push(`a.status = $${pi++}`);
    params.push(status);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const result = await query(
      `SELECT
         a.*,
         p.first_name || ' ' || p.last_name AS patient_name,
         p.phone AS patient_phone,
         COALESCE(u.first_name || ' ' || u.last_name, '— Не назначен —') AS doctor_name,
         doc.specialization,
         s.name AS service_name, s.price AS service_price,
         a.source
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       LEFT JOIN doctors doc ON doc.id = a.doctor_id
       LEFT JOIN users u ON u.id = doc.user_id
       LEFT JOIN services s ON s.id = a.service_id
       ${where}
       ORDER BY CASE WHEN a.appointment_dt IS NULL THEN 0 ELSE 1 END,
                a.appointment_dt ASC,
                a.created_at DESC
       LIMIT $${pi++} OFFSET $${pi}`,
      [...params, parseInt(limit), offset]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении записей' });
  }
};

// ── PATCH /api/appointments/:id ───────────────────────────
exports.update = async (req, res) => {
  const { id } = req.params;
  const {
    doctor_id, service_id, appointment_dt,
    duration_min, comment, status
  } = req.body;

  try {
    const result = await query(
      `UPDATE appointments SET
         doctor_id      = COALESCE($1, doctor_id),
         service_id     = COALESCE($2, service_id),
         appointment_dt = COALESCE($3, appointment_dt),
         duration_min   = COALESCE($4, duration_min),
         comment        = COALESCE($5, comment),
         status         = COALESCE($6, status),
         updated_at     = NOW()
       WHERE id = $7 RETURNING *`,
      [doctor_id, service_id, appointment_dt, duration_min, comment, status, id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Запись не найдена' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[appointments.update] ERROR:', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении записи' });
  }
};

// ── POST /api/appointments ────────────────────────────────
exports.create = async (req, res) => {
  const {
    patient_id, doctor_id, service_id,
    appointment_dt, duration_min, comment, source
  } = req.body;

  if (!patient_id || !doctor_id || !appointment_dt) {
    return res.status(400).json({ error: 'Пациент, врач и дата записи обязательны' });
  }

  try {
    // Check slot is free
    const conflict = await query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1
         AND status NOT IN ('cancelled','no_show')
         AND appointment_dt < ($2::timestamp + ($3 || ' minutes')::interval)
         AND (appointment_dt + (COALESCE(duration_min,60) || ' minutes')::interval) > $2::timestamp`,
      [doctor_id, appointment_dt, duration_min || 60]
    );

    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: 'Это время уже занято у данного врача' });
    }

    const result = await query(
      `INSERT INTO appointments
         (patient_id, doctor_id, service_id, appointment_dt,
          duration_min, comment, source, created_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING *`,
      [patient_id, doctor_id, service_id || null,
       appointment_dt, duration_min || 60,
       comment || null, source || 'admin', req.user.id]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
       VALUES ($1,'CREATE_APPOINTMENT','appointment',$2)`,
      [req.user.id, result.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании записи' });
  }
};

// ── PATCH /api/appointments/:id/status ───────────────────
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  try {
    // Получаем текущую запись для лога
    const oldAppt = await query('SELECT status FROM appointments WHERE id = $1', [id]);
    if (!oldAppt.rows[0]) return res.status(404).json({ error: 'Запись не найдена' });

    let sql = `UPDATE appointments SET status = $1, updated_at = NOW()`;
    const params = [status];

    // Если подтверждаем — записываем кто подтвердил
    if (status === 'confirmed') {
      sql += `, confirmed_by = $2`;
      params.push(req.user.id);
    }

    sql += ` WHERE id = $${params.length + 1} RETURNING *`;
    params.push(id);

    const result = await query(sql, params);

    // Логируем действие
    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, 'UPDATE_APPOINTMENT_STATUS', 'appointment', $2, $3, $4)`,
      [req.user.id, id, JSON.stringify({ status: oldAppt.rows[0].status }), JSON.stringify({ status })]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[appointments.updateStatus] ERROR:', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении статуса: ' + err.message });
  }
};

// ── GET /api/appointments/slots ───────────────────────────
// Returns free 30-min slots for a doctor on a given date
exports.availableSlots = async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(400).json({ error: 'doctorId и date обязательны' });
  }

  try {
    const schedule = await query(
      `SELECT start_time, end_time
       FROM doctor_schedule
       WHERE doctor_id = $1
         AND day_of_week = EXTRACT(ISODOW FROM $2::date)
         AND is_working = TRUE`,
      [doctorId, date]
    );

    if (!schedule.rows[0]) return res.json({ slots: [] });

    const { start_time, end_time } = schedule.rows[0];
    const booked = await query(
      `SELECT appointment_dt, duration_min FROM appointments
       WHERE doctor_id = $1
         AND appointment_dt::date = $2
         AND status NOT IN ('cancelled','no_show')`,
      [doctorId, date]
    );

    // Generate 30-min slots
    const slots = [];
    const [sh, sm] = start_time.split(':').map(Number);
    const [eh, em] = end_time.split(':').map(Number);
    let cur = sh * 60 + sm;
    const endMin = eh * 60 + em;

    while (cur + 30 <= endMin) {
      const h = String(Math.floor(cur / 60)).padStart(2, '0');
      const m = String(cur % 60).padStart(2, '0');
      const slotDt = new Date(`${date}T${h}:${m}:00`);

      const isBusy = booked.rows.some(b => {
        const bStart = new Date(b.appointment_dt);
        const bEnd = new Date(bStart.getTime() + (b.duration_min || 60) * 60000);
        const sEnd = new Date(slotDt.getTime() + 30 * 60000);
        return slotDt < bEnd && sEnd > bStart;
      });

      if (!isBusy) slots.push(`${h}:${m}`);
      cur += 30;
    }

    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении слотов' });
  }
};