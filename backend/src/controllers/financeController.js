const { query } = require('../utils/db');

// ── GET /api/finance/dashboard ────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    const [today, week, month, topServices, doctors] = await Promise.all([
      // Today stats
      query(`SELECT * FROM v_today_stats`),

      // This week revenue
      query(`
        SELECT COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS payments
        FROM payments
        WHERE paid_at >= DATE_TRUNC('week', CURRENT_DATE)
      `),

      // This month daily breakdown
      query(`SELECT * FROM v_monthly_revenue`),

      // Top 5 services by revenue this month
      query(`
        SELECT s.name, SUM(ts.price * ts.quantity) AS total,
               COUNT(*) AS count
        FROM treatment_services ts
        JOIN services s ON s.id = ts.service_id
        JOIN treatment_records tr ON tr.id = ts.treatment_record_id
        WHERE tr.visit_date >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY s.name
        ORDER BY total DESC LIMIT 5
      `),

      // Doctor stats this month
      query(`
        SELECT u.first_name || ' ' || u.last_name AS doctor_name,
               d.specialization,
               COUNT(DISTINCT a.id) AS appointments,
               COALESCE(SUM(p.amount),0) AS revenue
        FROM doctors d
        JOIN users u ON u.id = d.user_id
        LEFT JOIN appointments a ON a.doctor_id = d.id
          AND a.appointment_dt >= DATE_TRUNC('month', CURRENT_DATE)
          AND a.status = 'completed'
        LEFT JOIN treatment_records tr ON tr.doctor_id = d.id
          AND tr.visit_date >= DATE_TRUNC('month', CURRENT_DATE)
        LEFT JOIN payments p ON p.treatment_record_id = tr.id
        GROUP BY u.first_name, u.last_name, d.specialization
        ORDER BY revenue DESC
      `),
    ]);

    res.json({
      today: today.rows[0],
      week: week.rows[0],
      monthlyChart: month.rows,
      topServices: topServices.rows,
      doctorStats: doctors.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при загрузке статистики' });
  }
};

// ── GET /api/finance/payments ─────────────────────────────
exports.payments = async (req, res) => {
  const { from, to, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * parseInt(limit);
  const params = [parseInt(limit), offset];
  let dateFilter = '';

  if (from && to) {
    dateFilter = `WHERE p.paid_at::date BETWEEN $3 AND $4`;
    params.push(from, to);
  }

  try {
    const result = await query(
      `SELECT p.*,
              pt.first_name || ' ' || pt.last_name AS patient_name,
              u.first_name || ' ' || u.last_name AS received_by_name
       FROM payments p
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN users u ON u.id = p.received_by
       ${dateFilter}
       ORDER BY p.paid_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении платежей' });
  }
};

// ── POST /api/finance/payments ────────────────────────────
exports.createPayment = async (req, res) => {
  const { treatment_record_id, patient_id, amount, payment_method, notes } = req.body;

  if (!patient_id || !amount) {
    return res.status(400).json({ error: 'Пациент и сумма обязательны' });
  }

  try {
    const result = await query(
      `INSERT INTO payments
         (treatment_record_id, patient_id, amount, payment_method, notes, received_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [treatment_record_id || null, patient_id, amount,
       payment_method || 'cash', notes || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при создании платежа' });
  }
};

// ── GET /api/finance/export/pdf ───────────────────────────
exports.exportPdf = async (req, res) => {
  const PDFDocument = require('pdfkit');
  const { from, to } = req.query;

  try {
    const rows = await query(
      `SELECT p.paid_at, pt.last_name || ' ' || pt.first_name AS patient,
              p.amount, p.payment_method,
              u.last_name || ' ' || u.first_name AS received_by
       FROM payments p
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN users u ON u.id = p.received_by
       WHERE ($1::date IS NULL OR p.paid_at::date >= $1)
         AND ($2::date IS NULL OR p.paid_at::date <= $2)
       ORDER BY p.paid_at`,
      [from || null, to || null]
    );

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=finance_${from||'all'}.pdf`);
    
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Финансовый отчёт', { align: 'center' });
    doc.fontSize(12).text(`Период: ${from || 'начало'} — ${to || 'сегодня'}`, { align: 'center' });
    doc.moveDown();

    // Table Header
    const tableTop = 150;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Дата', 50, tableTop);
    doc.text('Пациент', 150, tableTop);
    doc.text('Сумма', 350, tableTop);
    doc.text('Метод', 420, tableTop);
    doc.text('Принял', 480, tableTop);
    
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    // Table Rows
    let y = tableTop + 25;
    let total = 0;
    doc.font('Helvetica');
    
    rows.rows.forEach(r => {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }
      const date = new Date(r.paid_at).toLocaleDateString('ru-RU');
      doc.text(date, 50, y);
      doc.text(r.patient.substring(0, 30), 150, y);
      doc.text(`${parseFloat(r.amount).toLocaleString('ru-RU')} сом`, 350, y);
      doc.text(r.payment_method, 420, y);
      doc.text((r.received_by || '').substring(0, 15), 480, y);
      
      total += parseFloat(r.amount);
      y += 20;
    });

    doc.moveDown();
    doc.font('Helvetica-Bold').text(`ИТОГО: ${total.toLocaleString('ru-RU')} сом`, 350, y + 10);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при создании PDF' });
  }
};

// ── GET /api/finance/export/excel ─────────────────────────
exports.exportExcel = async (req, res) => {
  const ExcelJS = require('exceljs');
  const { from, to } = req.query;

  try {
    const rows = await query(
      `SELECT p.paid_at, pt.last_name || ' ' || pt.first_name AS patient,
              p.amount, p.payment_method,
              u.last_name || ' ' || u.first_name AS received_by
       FROM payments p
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN users u ON u.id = p.received_by
       WHERE ($1::date IS NULL OR p.paid_at::date >= $1)
         AND ($2::date IS NULL OR p.paid_at::date <= $2)
       ORDER BY p.paid_at`,
      [from || null, to || null]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Финансы');

    ws.columns = [
      { header: 'Дата', key: 'paid_at', width: 20 },
      { header: 'Пациент', key: 'patient', width: 30 },
      { header: 'Сумма (сом)', key: 'amount', width: 15 },
      { header: 'Способ оплаты', key: 'payment_method', width: 20 },
      { header: 'Принял', key: 'received_by', width: 25 },
    ];

    rows.rows.forEach(r => ws.addRow(r));

    ws.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=finance_${from||'all'}_${to||'all'}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при экспорте' });
  }
};
