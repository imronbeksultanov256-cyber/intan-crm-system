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
const inventoryCtrl    = require('../controllers/inventoryController');
const { notifyNewLead } = require('../utils/notifications');

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

// ── UUID PARAMETER VALIDATION ──
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => {
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Неверный формат параметра id (ожидается UUID)' });
  }
  next();
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

// ── TREATMENT RECORDS ──────────────────────────────────────
router.post('/treatments',
  authenticate, authorize('patients:write'),
  patientsCtrl.createTreatmentRecord);

router.get('/treatments/:id',
  authenticate, authorize('patients:read'),
  patientsCtrl.getTreatmentRecord);

// ── SOFT DELETE — в корзину ────────────────────────────────
router.post('/patients/:id/restore',
  authenticate, requireRole('chief_doctor'),
  patientsCtrl.restore);

router.delete('/patients/:id/permanent',
  authenticate, requireRole('chief_doctor'),
  patientsCtrl.permanentDelete);




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

router.patch('/appointments/:id',
  authenticate, authorize('appointments:write'),
  appointmentsCtrl.update);

router.patch('/appointments/:id/status',
  authenticate, authorize('appointments:write'),
  appointmentsCtrl.updateStatus);

// ── PUBLIC — Online booking (no auth) ─────────────────────
// Клиент оставляет заявку. Врач и время НЕ обязательны.
router.post('/book', async (req, res) => {
  console.log('[BOOK] Request body:', JSON.stringify(req.body));
  
  const name    = req.body.patient_name || req.body.name || req.body.fullname || req.body.userName;
  const phone   = req.body.phone || req.body.telephone || req.body.userPhone;
  const email   = req.body.email;
  const docId   = req.body.doctor_id || req.body.doctorId;
  const svcId   = req.body.service_id || req.body.serviceId;
  const dt      = req.body.appointment_dt || req.body.preferred_dt || req.body.date || req.body.datetime;
  const comment = req.body.comment || req.body.message || req.body.notes;

  if (!name || !phone) {
    console.warn('[BOOK] Missing name or phone');
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }

  try {
    // Теперь просто сохраняем в таблицу leads, не создавая пациента сразу
    const lead = await query(
      `INSERT INTO leads
         (name, phone, email, doctor_id, service_id, preferred_dt, comment, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new') RETURNING *`,
      [name, phone, email || null, docId || null, svcId || null, dt || null, comment || null]
    );

    console.log('[BOOK] Lead created:', lead.rows[0].id);
    // Asynchronously notify via TG
    notifyNewLead(lead.rows[0]).catch(err => console.error('[BOOK] TG notify error:', err.message));

    res.status(201).json({ success: true, lead: lead.rows[0] });

  } catch (err) {
    console.error('[BOOK] ERROR:', err.message);
    // Если таблицы нет, попробуем создать её "на лету" (только один раз)
    if (err.message.includes('leads') && err.message.includes('does not exist')) {
       console.info('[BOOK] Attempting to auto-create leads table...');
       try {
         await query(`
           CREATE TABLE IF NOT EXISTS leads (
             id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
             name        VARCHAR(255) NOT NULL,
             phone       VARCHAR(30) NOT NULL,
             email       VARCHAR(255),
             service_id  UUID REFERENCES services(id),
             doctor_id   UUID REFERENCES doctors(id),
             preferred_dt TIMESTAMP,
             comment     TEXT,
             status      VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'processed', 'cancelled')),
             created_at  TIMESTAMP DEFAULT NOW(),
             updated_at  TIMESTAMP DEFAULT NOW()
           );
           CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
         `);
         // Пробуем еще раз
          const retry = await query(
            `INSERT INTO leads
               (name, phone, email, doctor_id, service_id, preferred_dt, comment, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'new') RETURNING *`,
            [name, phone, email || null, docId || null, svcId || null, dt || null, comment || null]
          );
          notifyNewLead(retry.rows[0]).catch(err => console.error('[BOOK] TG retry notify error:', err.message));
          return res.status(201).json({ success: true, lead: retry.rows[0] });
       } catch (e2) {
         console.error('[BOOK] Auto-create failed:', e2.message);
       }
    }
    res.status(500).json({ error: 'Ошибка при отправке заявки. Попробуйте позвонить нам.' });
  }
});

// ── LEADS / ЗАЯВКИ ─────────────────────────────────────────
router.get('/leads', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, s.name as service_name, u.last_name || ' ' || u.first_name as doctor_name
       FROM leads l
       LEFT JOIN services s ON s.id = l.service_id
       LEFT JOIN doctors d ON d.id = l.doctor_id
       LEFT JOIN users u ON u.id = d.user_id
       ORDER BY l.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    if (err.message.includes('leads') && err.message.includes('does not exist')) {
       try {
         await query(`
           CREATE TABLE IF NOT EXISTS leads (
             id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
             name        VARCHAR(255) NOT NULL,
             phone       VARCHAR(30) NOT NULL,
             email       VARCHAR(255),
             service_id  UUID REFERENCES services(id),
             doctor_id   UUID REFERENCES doctors(id),
             preferred_dt TIMESTAMP,
             comment     TEXT,
             status      VARCHAR(30) DEFAULT 'new' CHECK (status IN ('new', 'processed', 'cancelled')),
             created_at  TIMESTAMP DEFAULT NOW(),
             updated_at  TIMESTAMP DEFAULT NOW()
           );
           CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
         `);
         return res.json([]); // Возвращаем пустой список, так как таблица только что создана
       } catch (e2) {
         console.error('[LEADS] Auto-create failed:', e2.message);
       }
    }
    console.error('[LEADS] GET error:', err.message);
    res.status(500).json({ error: 'Ошибка при загрузке заявок' });
  }
});

router.patch('/leads/:id/status', authenticate, async (req, res) => {
  const { status } = req.body;
  try {
    await query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при обновлении статуса' });
  }
});

router.delete('/leads/:id', authenticate, authorize('patients:delete'), async (req, res) => {
  try {
    await query('DELETE FROM leads WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при удалении заявки' });
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

router.get('/doctors/:id/patients',
  authenticate, requireRole('chief_doctor', 'doctor'),
  doctorsCtrl.patients);

// ── FINANCE (chief_doctor only) ────────────────────────────
router.get('/finance/dashboard',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.dashboard);

router.get('/finance/payments',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.payments);

router.get('/finance/debts',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.getDebts);

router.post('/finance/payments',
  authenticate, requireRole('chief_doctor', 'admin'),
  financeCtrl.createPayment);

router.get('/finance/export/excel',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.exportExcel);

router.get('/finance/export/pdf',
  authenticate, requireRole('chief_doctor'),
  financeCtrl.exportPdf);

// ── INVENTORY / СКЛАД ──────────────────────────────────────
router.get('/inventory',
  authenticate, requireRole('chief_doctor', 'admin', 'doctor'),
  inventoryCtrl.list);

router.post('/inventory',
  authenticate, requireRole('chief_doctor', 'admin'),
  inventoryCtrl.create);

router.put('/inventory/:id',
  authenticate, requireRole('chief_doctor', 'admin'),
  inventoryCtrl.update);

router.post('/inventory/transaction',
  authenticate, requireRole('chief_doctor', 'admin', 'doctor'),
  inventoryCtrl.transaction);

router.get('/inventory/logs',
  authenticate, requireRole('chief_doctor', 'admin'),
  inventoryCtrl.logs);

router.get('/inventory/logs/:item_id',
  authenticate, requireRole('chief_doctor', 'admin'),
  inventoryCtrl.logs);

// ── ACTIVITY LOG ───────────────────────────────────────────
router.get('/logs',
  authenticate, requireRole('chief_doctor', 'admin'),
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
async function checkUserRelations(userId) {
  const docRes = await query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
  const doctorId = docRes.rows[0]?.id;

  const counts = {
    appointments: 0,
    treatment_records: 0,
    medical_records: 0,
    payments: 0,
    leads: 0,
  };

  if (doctorId) {
    const appRes = await query('SELECT COUNT(*) FROM appointments WHERE doctor_id = $1', [doctorId]);
    counts.appointments += parseInt(appRes.rows[0].count);

    const trRes = await query('SELECT COUNT(*) FROM treatment_records WHERE doctor_id = $1', [doctorId]);
    counts.treatment_records += parseInt(trRes.rows[0].count);

    const thRes = await query('SELECT COUNT(*) FROM tooth_history WHERE doctor_id = $1', [doctorId]);
    counts.medical_records += parseInt(thRes.rows[0].count);

    const tpRes = await query('SELECT COUNT(*) FROM treatment_plans WHERE doctor_id = $1', [doctorId]);
    counts.medical_records += parseInt(tpRes.rows[0].count);

    const leadsRes = await query('SELECT COUNT(*) FROM leads WHERE doctor_id = $1', [doctorId]);
    counts.leads += parseInt(leadsRes.rows[0].count);
  }

  const payRes = await query('SELECT COUNT(*) FROM payments WHERE received_by = $1', [userId]);
  counts.payments += parseInt(payRes.rows[0].count);

  return { counts, doctorId };
}

router.get('/users',
  authenticate, requireRole('chief_doctor', 'admin'),
  async (req, res) => {
    try {
      const result = await query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
                u.is_active, u.status, u.last_login, u.created_at, u.deleted_at, u.deleted_by,
                r.name AS role, r.label AS role_label
         FROM users u JOIN roles r ON r.id = u.role_id
         ORDER BY r.id, u.last_name`
      );
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Ошибка при загрузке сотрудников' });
    }
  }
);

router.post('/users',
  authenticate, requireRole('chief_doctor', 'admin'),
  async (req, res) => {
    const bcrypt = require('bcryptjs');
    const { email, password, first_name, last_name, phone, role_id, status } = req.body;
    if (!email || !password || !first_name || !last_name || !role_id) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    try {
      await query('BEGIN');
      const hash = await bcrypt.hash(password, 12);
      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, email, first_name, last_name`,
        [email, hash, first_name, last_name, phone || null, role_id, status || 'active']
      );
      const newUser = result.rows[0];

      if (parseInt(role_id) === 2) {
        await query(
          `INSERT INTO doctors (user_id, specialization)
           VALUES ($1, 'Врач-стоматолог')`,
          [newUser.id]
        );
      }

      await query('COMMIT');
      res.status(201).json(newUser);
    } catch (err) {
      await query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'Email уже используется' });
      res.status(500).json({ error: 'Ошибка при создании сотрудника' });
    }
  }
);

router.put('/users/:id',
  authenticate, requireRole('chief_doctor', 'admin'),
  async (req, res) => {
    const { id } = req.params;
    const { email, password, first_name, last_name, phone, role_id, status } = req.body;
    if (!email || !first_name || !last_name || !role_id) {
      return res.status(400).json({ error: 'Поля Email, Имя, Фамилия и Роль обязательны' });
    }
    try {
      await query('BEGIN');
      const userRes = await query('SELECT * FROM users WHERE id = $1', [id]);
      if (!userRes.rows[0]) {
        await query('ROLLBACK');
        return res.status(404).json({ error: 'Сотрудник не найден' });
      }

      let updateQuery = `
        UPDATE users SET
          email = $1,
          first_name = $2,
          last_name = $3,
          phone = $4,
          role_id = $5,
          status = $6,
          is_active = $7,
          updated_at = NOW()
      `;
      const isActive = !['archived', 'terminated', 'suspended'].includes(status);
      const params = [email, first_name, last_name, phone || null, role_id, status || userRes.rows[0].status, isActive];

      if (password && password.trim().length >= 6) {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password, 12);
        updateQuery += `, password_hash = $8 WHERE id = $9`;
        params.push(hash, id);
      } else {
        updateQuery += ` WHERE id = $8`;
        params.push(id);
      }

      await query(updateQuery, params);

      if (parseInt(role_id) === 2) {
        const docCheck = await query('SELECT id FROM doctors WHERE user_id = $1', [id]);
        if (!docCheck.rows[0]) {
          await query(
            `INSERT INTO doctors (user_id, specialization)
             VALUES ($1, 'Врач-стоматолог')`,
            [id]
          );
        }
      }

      await query('COMMIT');
      await query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, 'UPDATE_USER', 'user', $2, $3)`,
        [req.user.id, id, JSON.stringify({status})]
      ).catch(() => {});

      res.json({ success: true, message: 'Данные сотрудника обновлены' });
    } catch (err) {
      await query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'Email уже используется' });
      res.status(500).json({ error: 'Ошибка при обновлении сотрудника' });
    }
  }
);

router.post('/users/:id/archive',
  authenticate, requireRole('chief_doctor', 'admin'),
  async (req, res) => {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Вы не можете архивировать самого себя' });
    }
    try {
      const user = await query('SELECT id FROM users WHERE id = $1', [id]);
      if (!user.rows[0]) return res.status(404).json({ error: 'Сотрудник не найден' });

      await query(
        `UPDATE users SET
          is_active = FALSE,
          status = 'archived',
          deleted_at = NOW(),
          deleted_by = $1,
          updated_at = NOW()
         WHERE id = $2`,
        [req.user.id, id]
      );

      await query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'ARCHIVE_USER', 'user', $2)`,
        [req.user.id, id]
      ).catch(() => {});

      res.json({ success: true, message: 'Сотрудник архивирован' });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка при архивации сотрудника' });
    }
  }
);

router.post('/users/:id/restore',
  authenticate, requireRole('chief_doctor', 'admin'),
  async (req, res) => {
    const { id } = req.params;
    try {
      const user = await query('SELECT id FROM users WHERE id = $1', [id]);
      if (!user.rows[0]) return res.status(404).json({ error: 'Сотрудник не найден' });

      await query(
        `UPDATE users SET
          is_active = TRUE,
          status = 'active',
          deleted_at = NULL,
          deleted_by = NULL,
          updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      await query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'RESTORE_USER', 'user', $2)`,
        [req.user.id, id]
      ).catch(() => {});

      res.json({ success: true, message: 'Сотрудник восстановлен' });
    } catch (err) {
      res.status(500).json({ error: 'Ошибка при восстановлении сотрудника' });
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
      const user = await query('SELECT id, role_id FROM users WHERE id = $1', [id]);
      if (!user.rows[0]) return res.status(404).json({ error: 'Сотрудник не найден' });

      // Запрещаем физическое удаление врачей
      if (parseInt(user.rows[0].role_id) === 2) {
        return res.status(400).json({ 
          error: 'Физическое удаление врачей запрещено. Пожалуйста, используйте архивацию.',
          can_archive: true
        });
      }

      const { counts, doctorId } = await checkUserRelations(id);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      if (total > 0) {
        return res.status(400).json({
          error: 'Невозможно удалить сотрудника, так как с ним связаны данные. Используйте архивацию.',
          details: counts,
          can_archive: true
        });
      }

      await query('BEGIN');
      
      await query('UPDATE activity_log SET user_id = NULL WHERE user_id = $1', [id]);
      await query('DELETE FROM notifications WHERE user_id = $1', [id]);
      await query('UPDATE reminders SET created_by = NULL WHERE created_by = $1', [id]);
      await query('UPDATE services SET updated_by = NULL WHERE updated_by = $1', [id]);
      await query('UPDATE patients SET created_by = NULL WHERE created_by = $1', [id]);
      await query('UPDATE patient_files SET uploaded_by = NULL WHERE uploaded_by = $1', [id]);
      await query('UPDATE patient_anamnesis SET updated_by = NULL WHERE updated_by = $1', [id]);
      await query('UPDATE dental_chart SET updated_by = NULL WHERE updated_by = $1', [id]);
      await query('UPDATE treatment_plans SET created_by = NULL WHERE created_by = $1', [id]);
      await query('UPDATE inventory_transactions SET user_id = NULL WHERE user_id = $1', [id]);
      await query('UPDATE appointments SET created_by = NULL WHERE created_by = $1', [id]);
      await query('UPDATE appointments SET confirmed_by = NULL WHERE confirmed_by = $1', [id]);

      await query('DELETE FROM users WHERE id = $1', [id]);
      await query('COMMIT');

      await query(
        `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'PERMANENT_DELETE_USER', 'user', $2)`,
        [req.user.id, id]
      ).catch(() => {});

      res.json({ success: true, message: 'Сотрудник удалён' });
    } catch (err) {
      await query('ROLLBACK');
      console.error('[users.delete]', err.message);
      res.status(500).json({ error: 'Ошибка при полном удалении сотрудника' });
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
