const { query } = require('../utils/db');

// ══════════════════════════════════════════════════════════
// GET /api/patients
// ══════════════════════════════════════════════════════════
exports.list = async (req, res) => {
  const {
    search = '', page = 1, limit = 20,
    sortBy = 'created_at', order = 'DESC',
    includeDeleted
  } = req.query;

  const offset      = (parseInt(page) - 1) * parseInt(limit);
  const allowedSort = ['last_name','first_name','created_at','phone'];
  const sortColumn  = allowedSort.includes(sortBy) ? sortBy : 'created_at';
  const sortOrder   = order === 'ASC' ? 'ASC' : 'DESC';

  // Проверяем есть ли колонка is_deleted (после миграции)
  let hasDeletedCol = false;
  try {
    await query(`SELECT is_deleted FROM patients LIMIT 0`);
    hasDeletedCol = true;
  } catch(_) {}

  const showDeleted = includeDeleted === 'true' && req.user?.role === 'chief_doctor';
  const deletedFilter = hasDeletedCol
    ? (showDeleted ? '' : 'AND p.is_deleted = FALSE')
    : '';

  // ── ROLE-BASED FILTER ───────────────────────────────────
  let roleFilter = '';
  if (req.user?.role === 'doctor' && req.user.doctorId) {
    roleFilter = ` AND (p.assigned_doctor_id = '${req.user.doctorId}' OR p.id IN (SELECT patient_id FROM appointments WHERE doctor_id = '${req.user.doctorId}'))`;
  }

  try {
    const countRes = await query(
      `SELECT COUNT(*) FROM patients p
       WHERE CONCAT(p.last_name,' ',p.first_name,' ',COALESCE(p.middle_name,''),' ',p.phone)
             ILIKE $1 ${deletedFilter} ${roleFilter}`,
      [`%${search}%`]
    );

    const rows = await query(
      `SELECT
         p.id, p.first_name, p.last_name, p.middle_name,
         p.date_of_birth, p.phone, p.email, p.gender, p.created_at,
         p.assigned_doctor_id,
         u_doc.last_name || ' ' || SUBSTRING(u_doc.first_name, 1, 1) || '.' AS assigned_doctor_name,
         ${hasDeletedCol ? 'p.is_deleted, p.deleted_at,' : 'FALSE AS is_deleted, NULL AS deleted_at,'}
         (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) AS visit_count,
         (SELECT MAX(a.appointment_dt) FROM appointments a WHERE a.patient_id = p.id) AS last_visit
       FROM patients p
       LEFT JOIN doctors d_doc ON d_doc.id = p.assigned_doctor_id
       LEFT JOIN users u_doc ON u_doc.id = d_doc.user_id
       WHERE CONCAT(p.last_name,' ',p.first_name,' ',COALESCE(p.middle_name,''),' ',p.phone)
             ILIKE $1 ${deletedFilter} ${roleFilter}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, parseInt(limit), offset]
    );

    res.json({
      total: parseInt(countRes.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit),
      data:  rows.rows,
    });
  } catch (err) {
    console.error('[patients.list]', err.message);
    res.status(500).json({ error: 'Ошибка при получении списка пациентов' });
  }
};

// ══════════════════════════════════════════════════════════
// GET /api/patients/:id — полная карточка
// ══════════════════════════════════════════════════════════
exports.get = async (req, res) => {
  const { id } = req.params;
  try {
    const patient = await query(
      `SELECT p.*,
              u_doc.last_name || ' ' || u_doc.first_name AS assigned_doctor_name,
              pdd.total_accrued, pdd.total_paid, pdd.current_debt
       FROM patients p
       LEFT JOIN doctors d_doc ON d_doc.id = p.assigned_doctor_id
       LEFT JOIN users u_doc ON u_doc.id = d_doc.user_id
       LEFT JOIN v_patient_debt_details pdd ON pdd.patient_id = p.id
       WHERE p.id = $1`, [id]
    );
    if (!patient.rows[0]) return res.status(404).json({ error: 'Пациент не найден' });

    // Проверяем наличие новых таблиц (безопасно через whitelist)
    const tableExists = async (tbl) => {
      const allowed = ['patient_anamnesis', 'dental_chart', 'treatment_plans'];
      if (!allowed.includes(tbl)) return false;
      try {
        await query(`SELECT 1 FROM ${tbl} LIMIT 0`);
        return true;
      } catch(_) { return false; }
    };

    const [hasAnamnesis, hasDental, hasPlans] = await Promise.all([
      tableExists('patient_anamnesis'),
      tableExists('dental_chart'),
      tableExists('treatment_plans'),
    ]);

    const [appointments, treatments, files] = await Promise.all([
      query(
        `SELECT a.*,
                COALESCE(u.first_name||' '||u.last_name,'— Не назначен —') AS doctor_name,
                s.name AS service_name, s.price AS service_price
         FROM appointments a
         LEFT JOIN doctors  d ON d.id = a.doctor_id
         LEFT JOIN users    u ON u.id = d.user_id
         LEFT JOIN services s ON s.id = a.service_id
         WHERE a.patient_id = $1
         ORDER BY a.appointment_dt DESC LIMIT 30`, [id]
      ),
      query(
        `SELECT tr.*,
                u.first_name||' '||u.last_name AS doctor_name,
                vd.paid_amount, vd.balance,
                CASE 
                  WHEN COALESCE(vd.paid_amount,0) = 0 THEN 'unpaid'
                  WHEN COALESCE(vd.balance,0) > 0 THEN 'partial'
                  ELSE 'paid'
                END as payment_status
         FROM treatment_records tr
         LEFT JOIN doctors d ON d.id = tr.doctor_id
         LEFT JOIN users   u ON u.id = d.user_id
         LEFT JOIN v_treatment_debts vd ON vd.treatment_record_id = tr.id
         WHERE tr.patient_id = $1
         ORDER BY tr.visit_date DESC`, [id]
      ),
      query(
        `SELECT id, file_name, file_type, file_size, notes, created_at, file_path
         FROM patient_files WHERE patient_id = $1 ORDER BY created_at DESC`, [id]
      ),
    ]);

    // Новые таблицы — только если существуют
    const anamnesis = hasAnamnesis
      ? (await query('SELECT * FROM patient_anamnesis WHERE patient_id = $1', [id])).rows[0] || null
      : null;

    const dentalChart = hasDental
      ? (await query('SELECT tooth_num,status,surfaces,notes,color,updated_at FROM dental_chart WHERE patient_id = $1 ORDER BY tooth_num', [id])).rows
      : [];

    const treatmentPlans = hasPlans
      ? (await query(
          `SELECT tp.*,
                  COALESCE(u.first_name||' '||u.last_name,'—') AS doctor_name,
                  COALESCE(
                    json_agg(json_build_object(
                      'id',tpi.id,'tooth_num',tpi.tooth_num,
                      'service_name',tpi.service_name,'price',tpi.price,
                      'priority',tpi.priority,'planned_date',tpi.planned_date,
                      'completed_date',tpi.completed_date,'status',tpi.status,'notes',tpi.notes
                    ) ORDER BY tpi.sort_order) FILTER (WHERE tpi.id IS NOT NULL),
                    '[]'
                  ) AS items
           FROM treatment_plans tp
           LEFT JOIN doctors d  ON d.id = tp.doctor_id
           LEFT JOIN users   u  ON u.id = d.user_id
           LEFT JOIN treatment_plan_items tpi ON tpi.plan_id = tp.id
           WHERE tp.patient_id = $1
           GROUP BY tp.id, u.first_name, u.last_name
           ORDER BY tp.created_at DESC`, [id]
        )).rows
      : [];

    const payments = await query(
      `SELECT COALESCE(SUM(amount),0) AS total_paid, COUNT(*) AS payment_count
       FROM payments WHERE patient_id = $1 AND status = 'paid' AND is_refunded = FALSE`, [id]
    );

    const accrued = await query(
      `SELECT COALESCE(SUM(total_cost),0) AS total_accrued
       FROM treatment_records WHERE patient_id = $1`, [id]
    );

    const totalPaid    = parseFloat(payments.rows[0]?.total_paid    || 0);
    const totalAccrued = parseFloat(accrued.rows[0]?.total_accrued || 0);

    res.json({
      ...patient.rows[0],
      anamnesis,
      dental_chart:    dentalChart,
      treatment_plans: treatmentPlans,
      appointments:    appointments.rows,
      treatments:      treatments.rows,
      files:           files.rows,
      finance: {
        total_paid:    totalPaid,
        total_accrued: totalAccrued,
        debt:          Math.max(0, totalAccrued - totalPaid),
        payment_count: parseInt(payments.rows[0]?.payment_count || 0),
      },
    });
  } catch (err) {
    console.error('[patients.get]', err.message);
    res.status(500).json({ error: 'Ошибка при получении данных пациента' });
  }
};

// ══════════════════════════════════════════════════════════
// POST /api/patients
// ══════════════════════════════════════════════════════════
exports.create = async (req, res) => {
  const {
    first_name, last_name, middle_name, date_of_birth,
    phone, email, address, gender, allergies, chronic_diseases, notes,
    assigned_doctor_id
  } = req.body;

  if (!first_name || !last_name || !phone) {
    return res.status(400).json({ error: 'ФИО и телефон обязательны' });
  }

  try {
    const result = await query(
      `INSERT INTO patients
         (first_name, last_name, middle_name, date_of_birth, phone, email,
          address, gender, allergies, chronic_diseases, notes, created_by,
          assigned_doctor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [first_name, last_name, middle_name||null, date_of_birth||null,
       phone, email||null, address||null, gender||null,
       allergies||null, chronic_diseases||null, notes||null, req.user.id,
       assigned_doctor_id || null]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1,'CREATE_PATIENT','patient',$2,$3)`,
      [req.user.id, result.rows[0].id, JSON.stringify({name:`${last_name} ${first_name}`,phone})]
    ).catch(()=>{});

    // Если врач назначен сразу — пишем в историю
    if (assigned_doctor_id) {
      await query(
        `INSERT INTO patient_doctor_history (patient_id, doctor_id, changed_by, reason)
         VALUES ($1, $2, $3, 'Первичное назначение при регистрации')`,
        [result.rows[0].id, assigned_doctor_id, req.user.id]
      ).catch(() => {});
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[patients.create]', err.message, err.detail||'');
    res.status(500).json({ error: 'Ошибка при создании пациента', detail: err.message });
  }
};

// ══════════════════════════════════════════════════════════
// PUT /api/patients/:id
// ══════════════════════════════════════════════════════════
exports.update = async (req, res) => {
  const { id } = req.params;
  const {
    first_name, last_name, middle_name, date_of_birth,
    phone, email, address, gender, allergies, chronic_diseases, notes,
    assigned_doctor_id
  } = req.body;

  try {
    // Получаем текущего врача для истории
    const currentRes = await query('SELECT assigned_doctor_id FROM patients WHERE id = $1', [id]);
    const oldDoctorId = currentRes.rows[0]?.assigned_doctor_id;

    const result = await query(
      `UPDATE patients SET
         first_name       = COALESCE($1,  first_name),
         last_name        = COALESCE($2,  last_name),
         middle_name      = $3,
         date_of_birth    = $4,
         phone            = COALESCE($5,  phone),
         email            = $6,
         address          = $7,
         gender           = $8,
         allergies        = $9,
         chronic_diseases = $10,
         notes            = $11,
         assigned_doctor_id = COALESCE($12, assigned_doctor_id),
         updated_at       = NOW()
       WHERE id = $13 RETURNING *`,
      [first_name, last_name, middle_name, date_of_birth,
       phone, email, address, gender, allergies, chronic_diseases, notes,
       assigned_doctor_id || null, id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Пациент не найден' });

    // История смены врача
    if (assigned_doctor_id && assigned_doctor_id !== oldDoctorId) {
      await query(
        `INSERT INTO patient_doctor_history (patient_id, doctor_id, changed_by, reason)
         VALUES ($1, $2, $3, 'Смена лечащего врача через профиль')`,
        [id, assigned_doctor_id, req.user.id]
      ).catch(() => {});
    }

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
       VALUES ($1,'UPDATE_PATIENT','patient',$2)`,
      [req.user.id, id]
    ).catch(()=>{});

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[patients.update]', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении пациента' });
  }
};

// ══════════════════════════════════════════════════════════
// PUT /api/patients/:id/anamnesis
// ══════════════════════════════════════════════════════════
exports.updateAnamnesis = async (req, res) => {
  const { id } = req.params;
  const {
    complaints, life_anamnesis, disease_anamnesis,
    medications, past_surgeries, contraindications,
    emergency_contact_name, emergency_contact_phone,
    last_dental_visit, dental_anxiety, previous_treatments
  } = req.body;
  try {
    const result = await query(
      `INSERT INTO patient_anamnesis
         (patient_id, complaints, life_anamnesis, disease_anamnesis,
          medications, past_surgeries, contraindications,
          emergency_contact_name, emergency_contact_phone,
          last_dental_visit, dental_anxiety, previous_treatments, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (patient_id) DO UPDATE SET
         complaints              = EXCLUDED.complaints,
         life_anamnesis          = EXCLUDED.life_anamnesis,
         disease_anamnesis       = EXCLUDED.disease_anamnesis,
         medications             = EXCLUDED.medications,
         past_surgeries          = EXCLUDED.past_surgeries,
         contraindications       = EXCLUDED.contraindications,
         emergency_contact_name  = EXCLUDED.emergency_contact_name,
         emergency_contact_phone = EXCLUDED.emergency_contact_phone,
         last_dental_visit       = EXCLUDED.last_dental_visit,
         dental_anxiety          = EXCLUDED.dental_anxiety,
         previous_treatments     = EXCLUDED.previous_treatments,
         updated_by              = EXCLUDED.updated_by,
         updated_at              = NOW()
       RETURNING *`,
      [id, complaints||null, life_anamnesis||null, disease_anamnesis||null,
       medications||null, past_surgeries||null, contraindications||null,
       emergency_contact_name||null, emergency_contact_phone||null,
       last_dental_visit||null, dental_anxiety||false,
       previous_treatments||null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[patients.updateAnamnesis]', err.message);
    res.status(500).json({ error: 'Ошибка при сохранении анамнеза' });
  }
};

// ══════════════════════════════════════════════════════════
// PUT /api/patients/:id/dental-chart
// ══════════════════════════════════════════════════════════
exports.updateDentalChart = async (req, res) => {
  const { id } = req.params;
  const { tooth_num, status, surfaces, notes, color } = req.body;
  if (!tooth_num || !status) {
    return res.status(400).json({ error: 'Номер зуба и статус обязательны' });
  }
  try {
    const prev = await query(
      'SELECT status FROM dental_chart WHERE patient_id=$1 AND tooth_num=$2', [id, tooth_num]
    );
    const result = await query(
      `INSERT INTO dental_chart (patient_id,tooth_num,status,surfaces,notes,color,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (patient_id,tooth_num) DO UPDATE SET
         status=$3, surfaces=$4, notes=$5, color=$6, updated_by=$7, updated_at=NOW()
       RETURNING *`,
      [id, tooth_num, status, surfaces||[], notes||null, color||null, req.user.id]
    );
    // История зуба
    if (prev.rows[0]?.status !== status) {
      await query(
        `INSERT INTO tooth_history (patient_id,tooth_num,doctor_id,status_before,status_after,notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tooth_num, req.user.doctorId||null,
         prev.rows[0]?.status||'healthy', status, notes||null]
      ).catch(()=>{});
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[patients.updateDentalChart]', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении зубной формулы' });
  }
};

// ══════════════════════════════════════════════════════════
// GET /api/patients/:id/tooth/:num/history
// ══════════════════════════════════════════════════════════
exports.toothHistory = async (req, res) => {
  const { id, num } = req.params;
  try {
    const result = await query(
      `SELECT th.*,
              COALESCE(u.first_name||' '||u.last_name,'—') AS doctor_name
       FROM tooth_history th
       LEFT JOIN doctors d ON d.id = th.doctor_id
       LEFT JOIN users   u ON u.id = d.user_id
       WHERE th.patient_id=$1 AND th.tooth_num=$2
       ORDER BY th.procedure_date DESC`,
      [id, num]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении истории зуба' });
  }
};

// ══════════════════════════════════════════════════════════
// POST /api/patients/:id/treatment-plan
// ══════════════════════════════════════════════════════════
exports.createTreatmentPlan = async (req, res) => {
  const { id } = req.params;
  const { title, doctor_id, notes, items } = req.body;
  try {
    const plan = await query(
      `INSERT INTO treatment_plans (patient_id,doctor_id,title,notes,created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, doctor_id||null, title||'План лечения', notes||null, req.user.id]
    );
    if (items?.length) {
      for (let i=0; i<items.length; i++) {
        const item = items[i];
        await query(
          `INSERT INTO treatment_plan_items
             (plan_id,tooth_num,service_id,service_name,price,priority,planned_date,notes,sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [plan.rows[0].id, item.tooth_num||null, item.service_id||null,
           item.service_name, item.price||0, item.priority||1,
           item.planned_date||null, item.notes||null, i]
        );
      }
    }
    res.status(201).json(plan.rows[0]);
  } catch (err) {
    console.error('[patients.createTreatmentPlan]', err.message);
    res.status(500).json({ error: 'Ошибка при создании плана лечения' });
  }
};

// ══════════════════════════════════════════════════════════
// PATCH /api/patients/:id/treatment-plan/:planId/item/:itemId
// ══════════════════════════════════════════════════════════
exports.updatePlanItem = async (req, res) => {
  const { itemId } = req.params;
  const { status, completed_date } = req.body;
  try {
    const result = await query(
      `UPDATE treatment_plan_items SET status=$1, completed_date=$2 WHERE id=$3 RETURNING *`,
      [status, completed_date||null, itemId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при обновлении плана' });
  }
};

// ══════════════════════════════════════════════════════════
// DELETE /api/patients/:id — SOFT DELETE
// ══════════════════════════════════════════════════════════
exports.remove = async (req, res) => {
  const { id } = req.params;
  const { confirm_word, reason } = req.body;

  const allowed = ['chief_doctor','doctor'];
  if (!allowed.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Недостаточно прав для удаления пациента' });
  }
  if (confirm_word !== 'УДАЛИТЬ') {
    return res.status(400).json({ error: 'Введите слово УДАЛИТЬ для подтверждения' });
  }
  if (!reason || reason.trim().length < 5) {
    return res.status(400).json({ error: 'Укажите причину удаления (минимум 5 символов)' });
  }

  try {
    // Проверяем есть ли колонка is_deleted
    let hasDeletedCol = false;
    try { await query('SELECT is_deleted FROM patients LIMIT 0'); hasDeletedCol = true; } catch(_) {}

    const patient = await query('SELECT * FROM patients WHERE id=$1', [id]);
    if (!patient.rows[0]) return res.status(404).json({ error: 'Пациент не найден' });

    if (hasDeletedCol) {
      await query(
        `UPDATE patients SET is_deleted=TRUE, deleted_at=NOW(),
         deleted_by=$1, delete_reason=$2, updated_at=NOW() WHERE id=$3`,
        [req.user.id, reason.trim(), id]
      );
    } else {
      // Если миграция не выполнена — пока просто возвращаем успех
      // (реального удаления нет до выполнения миграции)
    }

    await query(
      `INSERT INTO activity_log (user_id,action,entity_type,entity_id,details)
       VALUES ($1,'SOFT_DELETE_PATIENT','patient',$2,$3)`,
      [req.user.id, id, JSON.stringify({reason:reason.trim(),
        name:`${patient.rows[0].last_name} ${patient.rows[0].first_name}`})]
    ).catch(()=>{});

    res.json({ success: true, message: 'Пациент перемещён в корзину' });
  } catch (err) {
    console.error('[patients.remove]', err.message);
    res.status(500).json({ error: 'Ошибка при удалении пациента' });
  }
};

// ══════════════════════════════════════════════════════════
// POST /api/patients/:id/restore
// ══════════════════════════════════════════════════════════
exports.restore = async (req, res) => {
  const { id } = req.params;
  if (req.user?.role !== 'chief_doctor') {
    return res.status(403).json({ error: 'Только главный врач может восстановить пациента' });
  }
  try {
    const result = await query(
      `UPDATE patients SET is_deleted=FALSE, deleted_at=NULL,
       deleted_by=NULL, delete_reason=NULL, updated_at=NOW()
       WHERE id=$1 AND is_deleted=TRUE RETURNING *`,
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Пациент не найден в корзине' });
    await query(
      `INSERT INTO activity_log (user_id,action,entity_type,entity_id)
       VALUES ($1,'RESTORE_PATIENT','patient',$2)`,
      [req.user.id, id]
    ).catch(()=>{});
    res.json({ success: true, patient: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при восстановлении' });
  }
};

// ══════════════════════════════════════════════════════════
// DELETE /api/patients/:id/permanent — только chief_doctor
// ══════════════════════════════════════════════════════════
exports.permanentDelete = async (req, res) => {
  const { id } = req.params;
  if (req.user?.role !== 'chief_doctor') {
    return res.status(403).json({ error: 'Только главный врач может окончательно удалить пациента' });
  }
  try {
    const patient = await query('SELECT * FROM patients WHERE id=$1 AND is_deleted=TRUE', [id]);
    if (!patient.rows[0]) return res.status(404).json({ error: 'Пациент не найден в корзине' });
    
    await query('BEGIN');

    // 1. Удаляем связанные данные, у которых нет ON DELETE CASCADE
    // Порядок важен из-за FK между самими таблицами (например, payments -> treatment_records)
    await query('DELETE FROM payments WHERE patient_id = $1', [id]);
    await query('DELETE FROM reminders WHERE patient_id = $1', [id]);
    
    // treatment_services удалятся каскадом при удалении treatment_records
    await query('DELETE FROM treatment_records WHERE patient_id = $1', [id]);
    await query('DELETE FROM appointments WHERE patient_id = $1', [id]);

    // 2. Лог
    await query(
      `INSERT INTO activity_log (user_id,action,entity_type,entity_id,old_values)
       VALUES ($1,'PERMANENT_DELETE_PATIENT','patient',$2,$3)`,
      [req.user.id, id, JSON.stringify(patient.rows[0])]
    ).catch(()=>{});

    // 3. Удаляем самого пациента (остальные таблицы типа dental_chart удалятся каскадом)
    await query('DELETE FROM patients WHERE id=$1', [id]);
    
    await query('COMMIT');
    res.json({ success: true, message: 'Пациент окончательно удалён' });
  } catch (err) {
    await query('ROLLBACK');
    console.error('[patients.permanentDelete]', err.message);
    res.status(500).json({ error: 'Ошибка при удалении: ' + err.message });
  }
};

// ══════════════════════════════════════════════════════════
// POST /api/treatments — создать запись о лечении
// ══════════════════════════════════════════════════════════
exports.createTreatmentRecord = async (req, res) => {
  const {
    appointment_id, patient_id, doctor_id,
    diagnosis, treatment, prescription, services, total_cost,
    next_visit
  } = req.body;

  if (!patient_id || !doctor_id) {
    return res.status(400).json({ error: 'patient_id и doctor_id обязательны' });
  }

  try {
    await query('BEGIN');

    // 1. Создаем основную запись
    const trRes = await query(
      `INSERT INTO treatment_records
         (appointment_id, patient_id, doctor_id, diagnosis, treatment, prescription, total_cost, next_visit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [appointment_id || null, patient_id, doctor_id, diagnosis, treatment, prescription, total_cost || 0, next_visit || null]
    );
    const tr = trRes.rows[0];

    // 2. Добавляем услуги
    if (services && Array.isArray(services)) {
      for (const s of services) {
        await query(
          `INSERT INTO treatment_services
             (treatment_record_id, service_id, service_name, price, quantity, tooth_num, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tr.id, s.id || null, s.name || s.service_name, s.price || 0, s.quantity || 1, s.tooth_num || null, s.notes || null]
        );

        // Если указан зуб — добавляем в историю зуба
        if (s.tooth_num) {
          await query(
            `INSERT INTO tooth_history (patient_id, tooth_num, treatment_record_id, doctor_id, procedure_name, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [patient_id, s.tooth_num, tr.id, doctor_id, s.name || s.service_name, s.notes || null]
          ).catch(()=>{});
        }
      }
    }

    // 3. Обновляем статус записи, если указана
    if (appointment_id) {
      await query(
        `UPDATE appointments SET status = 'completed', updated_at = NOW() WHERE id = $1`,
        [appointment_id]
      );
    }

    // 4. Создаем ожидающий платеж (опционально, но логично)
    if (total_cost > 0) {
      await query(
        `INSERT INTO payments (treatment_record_id, patient_id, amount, status, received_by)
         VALUES ($1, $2, $3, 'pending', $4)`,
        [tr.id, patient_id, total_cost, req.user.id]
      );
    }

    // 5. СОЗДАЕМ ПОВТОРНЫЙ ПРИЕМ, если указана дата
    if (next_visit) {
      // Проверяем, нет ли уже записи на эту дату для этого пациента (чтобы не дублировать)
      const existingAppt = await query(
        `SELECT id FROM appointments 
         WHERE patient_id = $1 AND appointment_dt::date = $2::date AND status != 'cancelled'`,
        [patient_id, next_visit]
      );

      if (existingAppt.rowCount === 0) {
        await query(
          `INSERT INTO appointments 
             (patient_id, doctor_id, appointment_dt, status, source, comment, created_by)
           VALUES ($1, $2, $3, 'pending', 'admin', 'Повторный приём (назначен автоматически)', $4)`,
          [patient_id, doctor_id, next_visit, req.user.id]
        );
      }
    }

    await query('COMMIT');
    res.status(201).json(tr);
  } catch (err) {
    await query('ROLLBACK');
    console.error('[createTreatmentRecord]', err.message);
    res.status(500).json({ error: 'Ошибка при сохранении протокола лечения' });
  }
};

// ══════════════════════════════════════════════════════════
// GET /api/treatments/:id
// ══════════════════════════════════════════════════════════
exports.getTreatmentRecord = async (req, res) => {
  const { id } = req.params;
  try {
    const tr = await query(
      `SELECT tr.*, 
              CONCAT(u.last_name, ' ', u.first_name) as doctor_name,
              p.last_name || ' ' || p.first_name as patient_name
       FROM treatment_records tr
       JOIN patients p ON p.id = tr.patient_id
       JOIN doctors d ON d.id = tr.doctor_id
       JOIN users u ON u.id = d.user_id
       WHERE tr.id = $1`,
      [id]
    );
    if (!tr.rows[0]) return res.status(404).json({ error: 'Запись не найдена' });

    const services = await query(
      `SELECT * FROM treatment_services WHERE treatment_record_id = $1`,
      [id]
    );

    res.json({
      ...tr.rows[0],
      services: services.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении записи' });
  }
};
