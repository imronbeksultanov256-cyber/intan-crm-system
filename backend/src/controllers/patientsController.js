const { query } = require('../utils/db');

// ── GET /api/patients ─────────────────────────────────────
exports.list = async (req, res) => {
  const { search = '', page = 1, limit = 20, sortBy = 'created_at', order = 'DESC' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const allowedSort = ['last_name','first_name','created_at','phone'];
  const sortColumn = allowedSort.includes(sortBy) ? sortBy : 'created_at';
  const sortOrder  = order === 'ASC' ? 'ASC' : 'DESC';

  try {
    const countRes = await query(
      `SELECT COUNT(*) FROM patients
       WHERE CONCAT(last_name,' ',first_name,' ',COALESCE(middle_name,''),' ',phone)
             ILIKE $1`,
      [`%${search}%`]
    );

    const rows = await query(
      `SELECT id, first_name, last_name, middle_name, date_of_birth,
              phone, email, gender, created_at,
              (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = patients.id) AS visit_count
       FROM patients
       WHERE CONCAT(last_name,' ',first_name,' ',COALESCE(middle_name,''),' ',phone)
             ILIKE $1
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, parseInt(limit), offset]
    );

    res.json({
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      data: rows.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении списка пациентов' });
  }
};

// ── GET /api/patients/:id ─────────────────────────────────
exports.get = async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await query('SELECT * FROM patients WHERE id = $1', [id]);
    if (!patient.rows[0]) return res.status(404).json({ error: 'Пациент не найден' });

    const appointments = await query(
      `SELECT a.*, d.id AS doctor_id,
              u.first_name || ' ' || u.last_name AS doctor_name,
              s.name AS service_name
       FROM appointments a
       LEFT JOIN doctors d ON d.id = a.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_dt DESC LIMIT 20`,
      [id]
    );

    const treatments = await query(
      `SELECT tr.*, u.first_name || ' ' || u.last_name AS doctor_name
       FROM treatment_records tr
       LEFT JOIN doctors d ON d.id = tr.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE tr.patient_id = $1
       ORDER BY tr.visit_date DESC LIMIT 10`,
      [id]
    );

    const files = await query(
      `SELECT id, file_name, file_type, file_size, notes, created_at
       FROM patient_files WHERE patient_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      ...patient.rows[0],
      appointments: appointments.rows,
      treatments: treatments.rows,
      files: files.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении данных пациента' });
  }
};

// ── POST /api/patients ────────────────────────────────────
exports.create = async (req, res) => {
  const {
    first_name, last_name, middle_name, date_of_birth,
    phone, email, address, gender, allergies, chronic_diseases, notes
  } = req.body;

  if (!first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'ФИО и телефон обязательны' });
  }

  try {
    const result = await query(
      `INSERT INTO patients
         (first_name, last_name, middle_name, date_of_birth, phone, email,
          address, gender, allergies, chronic_diseases, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [first_name, last_name, middle_name || null, date_of_birth || null,
       phone, email || null, address || null, gender || null,
       allergies || null, chronic_diseases || null, notes || null,
       req.user.id]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'CREATE_PATIENT', 'patient', $2)`,
      [req.user.id, result.rows[0].id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании пациента' });
  }
};

// ── PUT /api/patients/:id ─────────────────────────────────
exports.update = async (req, res) => {
  const { id } = req.params;
  const {
    first_name, last_name, middle_name, date_of_birth,
    phone, email, address, gender, allergies, chronic_diseases, notes
  } = req.body;

  try {
    const result = await query(
      `UPDATE patients SET
         first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         middle_name = $3,
         date_of_birth = $4,
         phone = COALESCE($5, phone),
         email = $6,
         address = $7,
         gender = $8,
         allergies = $9,
         chronic_diseases = $10,
         notes = $11,
         updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [first_name, last_name, middle_name, date_of_birth,
       phone, email, address, gender, allergies, chronic_diseases, notes, id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Пациент не найден' });

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'UPDATE_PATIENT', 'patient', $2)`,
      [req.user.id, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при обновлении пациента' });
  }
};

// ── DELETE /api/patients/:id (chief only) ─────────────────
exports.remove = async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM patients WHERE id = $1', [id]);
    res.json({ message: 'Пациент удалён' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при удалении пациента' });
  }
};
