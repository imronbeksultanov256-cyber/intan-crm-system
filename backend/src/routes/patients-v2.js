// ============================================================
// INTAN CLINIC — patients-routes-v2.js
// Роуты: анамнез, зубная формула, план лечения, soft delete
// Подключить в server.js: app.use('/api/patients', require('./routes/patients-v2'))
// ============================================================

const express  = require('express');
const router   = express.Router();
const { query } = require('../utils/db');   // Исправленный путь к БД
const { authenticate, requireRole, authorize } = require('../middleware/auth');

// Все роуты требуют авторизации
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// СПИСОК ПАЦИЕНТОВ  GET /api/patients
// ─────────────────────────────────────────────────────────────
router.get('/', authorize('patients:read'), async (req, res) => {
  try {
    const {
      search = '',
      page   = 1,
      limit  = 18,
      sortBy = 'created_at',
      includeDeleted = 'false',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const showDeleted = includeDeleted === 'true';

    // Только chief_doctor видит удалённых
    const isChief = req.user.role === 'chief_doctor';
    const deletedFilter = showDeleted && isChief
      ? 'TRUE'
      : 'p.is_deleted = FALSE';

    const allowedSort = ['created_at', 'last_name', 'first_name'];
    const sort = allowedSort.includes(sortBy) ? sortBy : 'created_at';

    const searchParam = `%${search}%`;

    const countRes = await query(
      `SELECT COUNT(*) FROM patients p
       WHERE ${deletedFilter}
       AND (p.last_name ILIKE $1 OR p.first_name ILIKE $1 OR p.phone ILIKE $1
            OR p.middle_name ILIKE $1)`,
      [searchParam]
    );

    const rows = await query(
      `SELECT
         p.*,
         CONCAT(ud.last_name, ' ', ud.first_name) AS assigned_doctor_name,
         (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS visit_count,
         (SELECT MAX(a.appointment_dt) FROM appointments a
          WHERE a.patient_id = p.id AND a.status = 'completed') AS last_visit
       FROM patients p
       LEFT JOIN doctors d ON d.id = p.doctor_id
       LEFT JOIN users ud ON ud.id = d.user_id
       WHERE ${deletedFilter}
       AND (p.last_name ILIKE $1 OR p.first_name ILIKE $1 OR p.phone ILIKE $1
            OR p.middle_name ILIKE $1)
       ORDER BY p.${sort} DESC
       LIMIT $2 OFFSET $3`,
      [searchParam, parseInt(limit), offset]
    );

    res.json({
      data:  rows.rows,
      total: parseInt(countRes.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  } catch (e) {
    console.error('[patients] GET /', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// СОЗДАТЬ ПАЦИЕНТА  POST /api/patients
// ─────────────────────────────────────────────────────────────
router.post('/', authorize('patients:write'), async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name,
      date_of_birth, phone, email, address,
      gender, allergies, chronic_diseases, notes, doctor_id
    } = req.body;

    if (!first_name || !last_name || !phone) {
      return res.status(400).json({ error: 'Обязательные поля: first_name, last_name, phone' });
    }

    const r = await query(
      `INSERT INTO patients
         (first_name, last_name, middle_name, date_of_birth, phone, email,
          address, gender, allergies, chronic_diseases, notes, created_by, doctor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [first_name, last_name, middle_name || null,
       date_of_birth || null, phone, email || null,
       address || null, gender || null,
       allergies || null, chronic_diseases || null,
       notes || null, req.user.id, doctor_id || null]
    );

    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('[patients] POST /', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// КАРТОЧКА ПАЦИЕНТА  GET /api/patients/:id
// ─────────────────────────────────────────────────────────────
router.get('/:id', authorize('patients:read'), async (req, res) => {
  try {
    const { id } = req.params;

    // Основные данные
    const pRes = await query(
      `SELECT p.*,
         CONCAT(ud.last_name, ' ', ud.first_name) AS assigned_doctor_name,
         json_build_object(
           'total_paid',    COALESCE((SELECT SUM(amount) FROM payments WHERE patient_id = p.id AND status='paid'), 0),
           'payment_count', COALESCE((SELECT COUNT(*) FROM payments WHERE patient_id = p.id AND status='paid'), 0)
         ) AS finance
       FROM patients p
       LEFT JOIN doctors d ON d.id = p.doctor_id
       LEFT JOIN users ud ON ud.id = d.user_id
       WHERE p.id = $1`,
      [id]
    );
    if (!pRes.rows.length) return res.status(404).json({ error: 'Пациент не найден' });

    const p = pRes.rows[0];

    // Визиты
    const appts = await query(
      `SELECT a.*,
         CONCAT(u.last_name,' ',u.first_name) AS doctor_name,
         s.name AS service_name
       FROM appointments a
       LEFT JOIN doctors d ON d.id = a.doctor_id
       LEFT JOIN users u   ON u.id = d.user_id
       LEFT JOIN services s ON s.id = a.service_id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_dt DESC
       LIMIT 50`,
      [id]
    );

    // История лечения
    const treats = await query(
      `SELECT tr.*,
         CONCAT(u.last_name,' ',u.first_name) AS doctor_name,
         COALESCE(
           json_agg(json_build_object(
             'service_name', ts.service_name,
             'price', ts.price,
             'quantity', ts.quantity
           )) FILTER (WHERE ts.id IS NOT NULL), '[]'
         ) AS services
       FROM treatment_records tr
       LEFT JOIN doctors d ON d.id = tr.doctor_id
       LEFT JOIN users u   ON u.id = d.user_id
       LEFT JOIN treatment_services ts ON ts.treatment_record_id = tr.id
       WHERE tr.patient_id = $1
       GROUP BY tr.id, u.last_name, u.first_name
       ORDER BY tr.visit_date DESC`,
      [id]
    );

    // Зубная формула
    const dental = await query(
      `SELECT * FROM dental_chart WHERE patient_id = $1`,
      [id]
    );

    // Анамнез
    const anamRes = await query(
      `SELECT * FROM patient_anamnesis WHERE patient_id = $1`,
      [id]
    );

    // Планы лечения
    const plans = await query(
      `SELECT tp.*,
         CONCAT(u.last_name,' ',u.first_name) AS doctor_name,
         COALESCE(
           json_agg(json_build_object(
             'id',            tpi.id,
             'tooth_num',     tpi.tooth_num,
             'service_name',  tpi.service_name,
             'price',         tpi.price,
             'priority',      tpi.priority,
             'status',        tpi.status,
             'planned_date',  tpi.planned_date,
             'completed_date',tpi.completed_date,
             'notes',         tpi.notes
           ) ORDER BY tpi.sort_order) FILTER (WHERE tpi.id IS NOT NULL), '[]'
         ) AS items
       FROM treatment_plans tp
       LEFT JOIN doctors d ON d.id = tp.doctor_id
       LEFT JOIN users u   ON u.id = d.user_id
       LEFT JOIN treatment_plan_items tpi ON tpi.plan_id = tp.id
       WHERE tp.patient_id = $1
       GROUP BY tp.id, u.last_name, u.first_name
       ORDER BY tp.created_at DESC`,
      [id]
    );

    // Файлы
    const files = await query(
      `SELECT * FROM patient_files WHERE patient_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.json({
      ...p,
      appointments:    appts.rows,
      treatments:      treats.rows,
      dental_chart:    dental.rows,
      anamnesis:       anamRes.rows[0] || null,
      treatment_plans: plans.rows,
      files:           files.rows,
    });
  } catch (e) {
    console.error('[patients] GET /:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ОБНОВИТЬ ПАЦИЕНТА  PUT /api/patients/:id
// ─────────────────────────────────────────────────────────────
router.put('/:id', authorize('patients:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name, last_name, middle_name,
      date_of_birth, phone, email, address,
      gender, allergies, chronic_diseases, notes, doctor_id
    } = req.body;

    const r = await query(
      `UPDATE patients SET
         first_name       = COALESCE($1, first_name),
         last_name        = COALESCE($2, last_name),
         middle_name      = $3,
         date_of_birth    = $4,
         phone            = COALESCE($5, phone),
         email            = $6,
         address          = $7,
         gender           = $8,
         allergies        = $9,
         chronic_diseases = $10,
         notes            = $11,
         doctor_id        = $12,
         updated_at       = NOW()
       WHERE id = $13 AND is_deleted = FALSE
       RETURNING *`,
      [first_name, last_name, middle_name || null,
       date_of_birth || null, phone, email || null,
       address || null, gender || null,
       allergies || null, chronic_diseases || null,
       notes || null, doctor_id || null, id]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Пациент не найден' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SOFT DELETE  DELETE /api/patients/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', authorize('patients:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm_word, reason } = req.body;

    if (confirm_word !== 'УДАЛИТЬ') {
      return res.status(400).json({ error: 'Неверное слово подтверждения' });
    }
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Укажите причину удаления (минимум 5 символов)' });
    }

    const r = await query(
      `UPDATE patients SET
         is_deleted    = TRUE,
         deleted_at    = NOW(),
         deleted_by    = $1,
         delete_reason = $2
       WHERE id = $3 AND is_deleted = FALSE
       RETURNING id`,
      [req.user.id, reason.trim(), id]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Пациент не найден' });

    // Лог
    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'soft_delete_patient', 'patient', $2, $3)`,
      [req.user.id, id, JSON.stringify({ reason })]
    );

    res.json({ success: true, message: 'Пациент перемещён в корзину' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ВОССТАНОВИТЬ  POST /api/patients/:id/restore
// ─────────────────────────────────────────────────────────────
router.post('/:id/restore', requireRole('chief_doctor'), async (req, res) => {
  try {
    const { id } = req.params;

    const r = await query(
      `UPDATE patients SET
         is_deleted    = FALSE,
         deleted_at    = NULL,
         deleted_by    = NULL,
         delete_reason = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Пациент не найден' });

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'restore_patient', 'patient', $2)`,
      [req.user.id, id]
    );

    res.json({ success: true, patient: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// АНАМНЕЗ  GET/PUT /api/patients/:id/anamnesis
// ─────────────────────────────────────────────────────────────
router.get('/:id/anamnesis', authorize('patients:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM patient_anamnesis WHERE patient_id = $1`,
      [req.params.id]
    );
    res.json(r.rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/anamnesis', authorize('patients:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      complaints, life_anamnesis, disease_anamnesis,
      medications, past_surgeries, contraindications,
      previous_treatments, last_dental_visit, dental_anxiety,
      emergency_contact_name, emergency_contact_phone,
    } = req.body;

    const r = await query(
      `INSERT INTO patient_anamnesis
         (patient_id, complaints, life_anamnesis, disease_anamnesis,
          medications, past_surgeries, contraindications,
          previous_treatments, last_dental_visit, dental_anxiety,
          emergency_contact_name, emergency_contact_phone, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (patient_id) DO UPDATE SET
         complaints              = EXCLUDED.complaints,
         life_anamnesis          = EXCLUDED.life_anamnesis,
         disease_anamnesis       = EXCLUDED.disease_anamnesis,
         medications             = EXCLUDED.medications,
         past_surgeries          = EXCLUDED.past_surgeries,
         contraindications       = EXCLUDED.contraindications,
         previous_treatments     = EXCLUDED.previous_treatments,
         last_dental_visit       = EXCLUDED.last_dental_visit,
         dental_anxiety          = EXCLUDED.dental_anxiety,
         emergency_contact_name  = EXCLUDED.emergency_contact_name,
         emergency_contact_phone = EXCLUDED.emergency_contact_phone,
         updated_by              = EXCLUDED.updated_by,
         updated_at              = NOW()
       RETURNING *`,
      [id, complaints||null, life_anamnesis||null, disease_anamnesis||null,
       medications||null, past_surgeries||null, contraindications||null,
       previous_treatments||null,
       last_dental_visit || null,
       dental_anxiety === true || dental_anxiety === 'true',
       emergency_contact_name||null, emergency_contact_phone||null,
       req.user.id]
    );

    res.json(r.rows[0]);
  } catch (e) {
    console.error('[anamnesis] PUT', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ЗУБНАЯ ФОРМУЛА  GET/PUT /api/patients/:id/dental-chart
// ─────────────────────────────────────────────────────────────
router.get('/:id/dental-chart', authorize('patients:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM dental_chart WHERE patient_id = $1 ORDER BY tooth_num`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/dental-chart', authorize('patients:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tooth_num, status, notes, surfaces, color } = req.body;

    if (!tooth_num || !status) {
      return res.status(400).json({ error: 'tooth_num и status обязательны' });
    }

    // Получаем текущий статус для истории
    const current = await query(
      `SELECT status FROM dental_chart WHERE patient_id = $1 AND tooth_num = $2`,
      [id, tooth_num]
    );
    const oldStatus = current.rows[0]?.status || 'healthy';

    // Обновляем или создаём запись зуба
    const r = await query(
      `INSERT INTO dental_chart (patient_id, tooth_num, status, notes, surfaces, color, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (patient_id, tooth_num) DO UPDATE SET
         status     = EXCLUDED.status,
         notes      = EXCLUDED.notes,
         surfaces   = EXCLUDED.surfaces,
         color      = EXCLUDED.color,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [id, tooth_num, status, notes || null,
       surfaces || null, color || null, req.user.id]
    );

    // Пишем в историю только если статус изменился
    if (oldStatus !== status) {
      await query(
        `INSERT INTO tooth_history
           (patient_id, tooth_num, doctor_id, status_before, status_after, notes)
         VALUES ($1, $2, (SELECT id FROM doctors WHERE user_id = $3 LIMIT 1), $4, $5, $6)`,
        [id, tooth_num, req.user.id, oldStatus, status, notes || null]
      );
    }

    res.json(r.rows[0]);
  } catch (e) {
    console.error('[dental-chart] PUT', e);
    res.status(500).json({ error: e.message });
  }
});

// ИСТОРИЯ ЗУБА  GET /api/patients/:id/tooth/:num/history
router.get('/:id/tooth/:num/history', authorize('patients:read'), async (req, res) => {
  try {
    const r = await query(
      `SELECT th.*,
         CONCAT(u.last_name,' ',u.first_name) AS doctor_name
       FROM tooth_history th
       LEFT JOIN doctors d ON d.id = th.doctor_id
       LEFT JOIN users u   ON u.id = d.user_id
       WHERE th.patient_id = $1 AND th.tooth_num = $2
       ORDER BY th.created_at DESC`,
      [req.params.id, req.params.num]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ПЛАН ЛЕЧЕНИЯ  POST/GET /api/patients/:id/treatment-plan
// ─────────────────────────────────────────────────────────────
router.get('/:id/treatment-plans', authorize('patients:read'), async (req, res) => {
  try {
    const plans = await query(
      `SELECT tp.*,
         CONCAT(u.last_name,' ',u.first_name) AS doctor_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id',             tpi.id,
               'tooth_num',      tpi.tooth_num,
               'service_name',   tpi.service_name,
               'price',          tpi.price,
               'priority',       tpi.priority,
               'status',         tpi.status,
               'planned_date',   tpi.planned_date,
               'completed_date', tpi.completed_date,
               'notes',          tpi.notes
             ) ORDER BY tpi.sort_order
           ) FILTER (WHERE tpi.id IS NOT NULL), '[]'
         ) AS items
       FROM treatment_plans tp
       LEFT JOIN doctors d ON d.id = tp.doctor_id
       LEFT JOIN users u   ON u.id = d.user_id
       LEFT JOIN treatment_plan_items tpi ON tpi.plan_id = tp.id
       WHERE tp.patient_id = $1
       GROUP BY tp.id, u.last_name, u.first_name
       ORDER BY tp.created_at DESC`,
      [req.params.id]
    );
    res.json(plans.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/treatment-plan', authorize('patients:write'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, notes, items = [] } = req.body;

    if (!title) return res.status(400).json({ error: 'Укажите название плана' });

    // Ищем doctor_id для текущего пользователя
    const docRes = await query(
      `SELECT id FROM doctors WHERE user_id = $1 LIMIT 1`,
      [req.user.id]
    );
    const doctor_id = docRes.rows[0]?.id || null;

    const planRes = await query(
      `INSERT INTO treatment_plans (patient_id, doctor_id, title, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, doctor_id, title, notes || null, req.user.id]
    );
    const plan = planRes.rows[0];

    // Вставляем позиции
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.service_name) continue;
      await query(
        `INSERT INTO treatment_plan_items
           (plan_id, tooth_num, service_id, service_name, price, priority, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [plan.id, item.tooth_num || null, item.service_id || null,
         item.service_name, item.price || null,
         item.priority || 2, item.notes || null, i]
      );
    }

    res.status(201).json(plan);
  } catch (e) {
    console.error('[treatment-plan] POST', e);
    res.status(500).json({ error: e.message });
  }
});

// ВЫПОЛНИТЬ ПОЗИЦИЮ ПЛАНА  PATCH /api/patients/:id/treatment-plan/:planId/item/:itemId
router.patch('/:id/treatment-plan/:planId/item/:itemId', authorize('patients:write'), async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status, completed_date } = req.body;

    const r = await query(
      `UPDATE treatment_plan_items SET
         status         = $1,
         completed_date = $2
       WHERE id = $3
       RETURNING *`,
      [status || 'completed', completed_date || new Date().toISOString().split('T')[0], itemId]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Позиция не найдена' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// ФАЙЛЫ  POST /api/patients/:id/files
// ─────────────────────────────────────────────────────────────
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || './uploads', 'patients', req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|pdf|dcm|doc|docx|xls|xlsx)$/i;
    cb(null, allowed.test(file.originalname));
  },
});

router.post('/:id/files', authorize('files:write'), upload.array('file', 10), async (req, res) => {
  try {
    const { id } = req.params;
    const { file_type = 'document', notes } = req.body;
    const files = req.files || [];

    if (!files.length) return res.status(400).json({ error: 'Файл не получен' });

    const saved = [];
    for (const f of files) {
      const r = await query(
        `INSERT INTO patient_files
           (patient_id, uploaded_by, file_name, file_path, file_type, file_size, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [id, req.user.id, f.originalname, f.path, file_type, f.size, notes || null]
      );
      saved.push(r.rows[0]);
    }

    res.status(201).json(saved);
  } catch (e) {
    console.error('[files] POST', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
