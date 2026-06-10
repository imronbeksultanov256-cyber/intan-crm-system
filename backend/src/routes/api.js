const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { authenticate, authorize, requireRole, doctorOrChief } = require('../middleware/auth');

const authCtrl         = require('../controllers/authController');
const patientsCtrl     = require('../controllers/patientsController');
const appointmentsCtrl = require('../controllers/appointmentsController');
const servicesCtrl     = require('../controllers/servicesController');
const financeCtrl      = require('../controllers/financeController');
const doctorsCtrl      = require('../controllers/doctorsController');

// ── FILE UPLOAD SETUP ──────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|dcm|doc|docx/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// ── AUTH ROUTES ────────────────────────────────────────────
router.post('/auth/login',   authCtrl.login);
router.post('/auth/refresh', authCtrl.refresh);
router.post('/auth/logout',  authenticate, authCtrl.logout);
router.get('/auth/me',       authenticate, authCtrl.me);

// ── PATIENTS ───────────────────────────────────────────────
router.get('/patients',
  authenticate, authorize('patients:read'),
  patientsCtrl.list);

router.get('/patients/:id',
  authenticate, authorize('patients:read'),
  patientsCtrl.get);

router.post('/patients',
  authenticate, authorize('patients:write'),
  patientsCtrl.create);

router.put('/patients/:id',
  authenticate, authorize('patients:write'),
  patientsCtrl.update);

router.delete('/patients/:id',
  authenticate, authorize('patients:delete'),
  patientsCtrl.remove);


// ── PATIENT ANAMNESIS ──────────────────────────────────────
router.put('/patients/:id/anamnesis',
  authenticate, authorize('patients:write'),
  patientsCtrl.updateAnamnesis);

// ── DENTAL CHART ───────────────────────────────────────────
router.put('/patients/:id/dental-chart',
  authenticate, authorize('patients:write'),
  patientsCtrl.updateDentalChart);

router.get('/patients/:id/tooth/:num/history',
  authenticate, authorize('patients:read'),
  patientsCtrl.toothHistory);

// ── TREATMENT PLANS ────────────────────────────────────────
router.post('/patients/:id/treatment-plan',
  authenticate, authorize('patients:write'),
  patientsCtrl.createTreatmentPlan);

router.patch('/patients/:id/treatment-plan/:planId/item/:itemId',
  authenticate, authorize('patients:write'),
  patientsCtrl.updatePlanItem);

// ── SOFT DELETE — в корзину ────────────────────────────────
router.post('/patients/:id/restore',
  authenticate, requireRole('chief_doctor'),
  patientsCtrl.restore);

router.delete('/patients/:id/permanent',
  authenticate, requireRole('chief_doctor'),
  patientsCtrl.permanentDelete);

// ── PATIENT FILES ──────────────────────────────────────────
const { query } = require('../utils/db');

router.post('/patients/:id/files',
  authenticate, authorize('files:write'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    try {
      const result = await query(
        `INSERT INTO patient_files
           (patient_id, uploaded_by, file_name, file_path, file_type, file_size, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.params.id, req.user.id, req.file.originalname,
         req.file.path, req.body.file_type || 'document',
         req.file.size, req.body.notes || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Ошибка при загрузке файла' });
    }
  }
);

// ── APPOINTMENTS ───────────────────────────────────────────
router.get('/appointments',
  authenticate, doctorOrChief,
  appointmentsCtrl.list);

router.get('/appointments/slots',
  authenticate,
  appointmentsCtrl.availableSlots);

router.post('/appointments',
  authenticate, authorize('appointments:write'),
  appointmentsCtrl.create);

router.patch('/appointments/:id/status',
  authenticate, authorize('appointments:write'),
  appointmentsCtrl.updateStatus);

// ── PUBLIC — Online booking (no auth) ─────────────────────
// ИСПРАВЛЕНО: doctor_id NOT NULL в БД — автоматически назначаем первого врача
router.post('/book', async (req, res) => {
  const { patient_name, phone, doctor_id, service_id, appointment_dt, comment } = req.body;

  if (!patient_name || !phone || !appointment_dt) {
    return res.status(400).json({ error: 'Имя, телефон и дата обязательны' });
  }

  try {
    // 1. Найти или создать пациента
    let patient = (await query(
      'SELECT id FROM patients WHERE phone = $1 LIMIT 1', [phone]
    )).rows[0];

    if (!patient) {
      const nameParts = patient_name.trim().split(' ');
      const result = await query(
        `INSERT INTO patients (last_name, first_name, middle_name, phone)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [nameParts[0] || '', nameParts[1] || '', nameParts[2] || null, phone]
      );
      patient = result.rows[0];
    }

    // 2. Определяем врача
    // Если doctor_id передан — используем его
    // Если нет — берём первого активного врача (doctor_id NOT NULL в схеме БД)
    let finalDoctorId = doctor_id || null;
    if (!finalDoctorId) {
      const defDoc = await query(
        `SELECT d.id FROM doctors d
         JOIN users u ON u.id = d.user_id
         WHERE u.is_active = TRUE
         ORDER BY d.id
         LIMIT 1`
      );
      finalDoctorId = defDoc.rows[0]?.id || null;
    }

    if (!finalDoctorId) {
      return res.status(500).json({ error: 'В клинике нет активных врачей. Позвоните нам.' });
    }

    // 3. Создаём запись
    const appt = await query(
      `INSERT INTO appointments
         (patient_id, doctor_id, service_id, appointment_dt, comment, source)
       VALUES ($1,$2,$3,$4,$5,'online') RETURNING id, appointment_dt`,
      [patient.id, finalDoctorId, service_id || null, appointment_dt, comment || null]
    );

    res.status(201).json({ success: true, appointment: appt.rows[0] });

  } catch (err) {
    console.error('[/book] ERROR:', err.message);
    console.error('[/book] DETAIL:', err.detail || '');
    res.status(500).json({ error: 'Ошибка при записи. Попробуйте позвонить нам.' });
  }
});

// ── SERVICES / PRICE LIST ──────────────────────────────────
router.get('/services',            servicesCtrl.list);   // public
router.get('/services/export/pdf', authenticate, servicesCtrl.exportPDF);

router.post('/services',
  authenticate, requireRole('chief_doctor'),
  servicesCtrl.create);

router.put('/services/:id',
  authenticate, requireRole('chief_doctor'),
  servicesCtrl.update);

router.delete('/services/:id',
  authenticate, requireRole('chief_doctor'),
  servicesCtrl.remove);

// ── DOCTORS ────────────────────────────────────────────────
router.get('/doctors', doctorsCtrl.list);   // public
router.get('/doctors/:id', doctorsCtrl.get); // public

router.put('/doctors/:id',
  authenticate, requireRole('chief_doctor'),
  doctorsCtrl.update);

router.put('/doctors/:id/schedule',
  authenticate, requireRole('chief_doctor'),
  doctorsCtrl.updateSchedule);

router.get('/doctors/:id/stats',
  authenticate, requireRole('chief_doctor', 'doctor'),
  doctorsCtrl.stats);

// ── FINANCE (chief_doctor only) ────────────────────────────
router.get('/finance/dashboard',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.dashboard);

router.get('/finance/payments',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.payments);

router.post('/finance/payments',
  authenticate, requireRole('chief_doctor', 'admin'),
  financeCtrl.createPayment);

router.get('/finance/export/excel',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.exportExcel);

// ── ACTIVITY LOG ───────────────────────────────────────────
router.get('/logs',
  authenticate, requireRole('chief_doctor'),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT al.*, u.first_name || ' ' || u.last_name AS user_name, r.name AS role
         FROM activity_log al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN roles r ON r.id = (SELECT role_id FROM users WHERE id = al.user_id)
         ORDER BY al.created_at DESC LIMIT 200`
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Ошибка при загрузке журнала' });
    }
  }
);

// ── USERS MANAGEMENT ──────────────────────────────────────
router.get('/users',
  authenticate, requireRole('chief_doctor'),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
                u.is_active, u.last_login, u.created_at,
                r.name AS role, r.label AS role_label
         FROM users u JOIN roles r ON r.id = u.role_id
         ORDER BY r.id, u.last_name`
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Ошибка' });
    }
  }
);

router.post('/users',
  authenticate, requireRole('chief_doctor'),
  async (req, res) => {
    const bcrypt = require('bcryptjs');
    const { email, password, first_name, last_name, phone, role_id } = req.body;
    if (!email || !password || !first_name || !last_name || !role_id) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    try {
      const hash = await bcrypt.hash(password, 12);
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, first_name, last_name`,
        [email, hash, first_name, last_name, phone || null, role_id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Email уже используется' });
      res.status(500).json({ error: 'Ошибка при создании пользователя' });
    }
  }
);

router.delete('/users/:id',
  authenticate, requireRole('chief_doctor'),
  async (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Вы не можете удалить самого себя' });
    }
    try {
      // Проверяем существование
      const user = await query('SELECT id FROM users WHERE id = $1', [id]);
      if (!user.rows[0]) return res.status(404).json({ error: 'Сотрудник не найден' });

      await query('DELETE FROM users WHERE id = $1', [id]);
      
      await query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'DELETE_USER', 'user', $2)`,
        [req.user.id, id]
      ).catch(() => {});

      res.json({ success: true, message: 'Сотрудник удалён' });
    } catch (err) {
      console.error('[users.delete]', err.message);
      res.status(500).json({ error: 'Ошибка при удалении сотрудника. Возможно, у него есть связанные записи (врач, приёмы).' });
    }
  }
);

// ── DASHBOARD SUMMARY ─────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const statsResult = await query('SELECT * FROM v_today_stats');
    const stats = statsResult.rows[0] || {
      today_appointments: 0,
      today_completed:    0,
      today_revenue:      0,
      new_patients_today: 0,
    };

    const weeklyChartResult = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('day', a.appointment_dt), 'YYYY-MM-DD') AS date,
        COUNT(*) AS count
      FROM appointments a
      WHERE a.appointment_dt >= DATE_TRUNC('week', CURRENT_DATE)
        AND a.appointment_dt <  DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '1 week'
      GROUP BY DATE_TRUNC('day', a.appointment_dt)
      ORDER BY 1
    `);

    // ИСПРАВЛЕНО: LEFT JOIN чтобы онлайн-заявки без врача тоже попадали в upcoming
    const upcomingResult = await query(`
      SELECT
        a.appointment_dt,
        a.status,
        a.source,
        p.first_name || ' ' || p.last_name AS patient_name,
        COALESCE(u.first_name || ' ' || u.last_name, '— Не назначен —') AS doctor_name
      FROM appointments a
      JOIN     patients p ON p.id = a.patient_id
      LEFT JOIN doctors  d ON d.id = a.doctor_id
      LEFT JOIN users    u ON u.id = d.user_id
      WHERE a.appointment_dt >= NOW()
        AND a.status IN ('pending', 'confirmed')
      ORDER BY a.appointment_dt
      LIMIT 10
    `);

    const topDoctorsResult = await query(`
      SELECT
        d.id,
        u.last_name || ' ' || SUBSTRING(u.first_name, 1, 1) || '.' AS name,
        COUNT(DISTINCT a.id)         AS appointments_count,
        COALESCE(SUM(pay.amount), 0) AS total_revenue
      FROM doctors d
      JOIN  users        u   ON u.id   = d.user_id
      LEFT JOIN appointments a   ON a.doctor_id = d.id
        AND a.status          = 'completed'
        AND a.appointment_dt >= DATE_TRUNC('month', CURRENT_DATE)
      LEFT JOIN treatment_records tr  ON tr.appointment_id = a.id
      LEFT JOIN payments          pay ON pay.treatment_record_id = tr.id
      GROUP BY d.id, u.last_name, u.first_name
      ORDER BY total_revenue DESC
      LIMIT 5
    `);

    const recentResult = await query(`
      SELECT
        al.action,
        al.entity_type,
        al.created_at,
        u.first_name || ' ' || u.last_name AS user_name
      FROM activity_log al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT 10
    `);

    res.json({
      stats: {
        todayAppointments: parseInt(stats.today_appointments)  || 0,
        todayCompleted:    parseInt(stats.today_completed)     || 0,
        todayRevenue:      parseFloat(stats.today_revenue)     || 0,
        newPatientsToday:  parseInt(stats.new_patients_today)  || 0,
      },
      weeklyChart:    weeklyChartResult.rows,
      upcoming:       upcomingResult.rows,
      topDoctors:     topDoctorsResult.rows,
      recentActivity: recentResult.rows,
    });

  } catch (err) {
    console.error('=== DASHBOARD 500 ===');
    console.error('Message:', err.message);
    console.error('Detail:',  err.detail);
    console.error('====================');
    res.status(500).json({ error: 'Ошибка при загрузке дашборда' });
  }
});

module.exports = router;
