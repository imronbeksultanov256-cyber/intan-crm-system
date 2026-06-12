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
  const path = require('path');
  const fs = require('fs');
  const { from, to } = req.query;

  try {
    const rowsRes = await query(
      `SELECT p.paid_at, pt.last_name || ' ' || pt.first_name AS patient,
              p.amount, p.payment_method, p.status,
              u.last_name || ' ' || u.first_name AS received_by
       FROM payments p
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN users u ON u.id = p.received_by
       WHERE ($1::date IS NULL OR p.paid_at::date >= $1)
         AND ($2::date IS NULL OR p.paid_at::date <= $2)
       ORDER BY p.paid_at`,
      [from || null, to || null]
    );
    const rows = rowsRes.rows;

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const fontPath = path.join(__dirname, '../utils/Roboto-Regular.ttf');
    
    if (fs.existsSync(fontPath)) {
      doc.registerFont('Roboto', fontPath);
      doc.font('Roboto');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=finance_report.pdf`);
    doc.pipe(res);

    // Header
    doc.fillColor('#1B4F72').fontSize(20).text('Финансовый отчёт клиники «Интан»', { align: 'center' });
    doc.moveDown(0.5);
    doc.fillColor('#666666').fontSize(10).text(`Период: ${from || 'начало'} — ${to || 'сегодня'}`, { align: 'center' });
    doc.moveDown(2);

    // Table Header
    const tableTop = 120;
    const colWidths = [30, 110, 150, 80, 80, 80];
    const colX = [30, 60, 170, 320, 400, 480];
    const headers = ['№', 'Дата', 'Пациент', 'Сумма', 'Метод', 'Статус'];

    doc.fillColor('#1B6CA8').fontSize(10);
    headers.forEach((h, i) => {
      doc.text(h, colX[i], tableTop, { width: colWidths[i], align: i === 3 ? 'right' : 'left' });
    });

    doc.moveTo(30, tableTop + 15).lineTo(560, tableTop + 15).strokeColor('#D0D7DE').stroke();

    // Data Rows
    let y = tableTop + 25;
    let total = 0;
    const methodLabels = { cash: 'Налич', card: 'Карта', transfer: 'Перевод' };

    rows.forEach((r, i) => {
      if (y > 750) {
        doc.addPage();
        y = 50;
        // Repeat headers on new page
        doc.fillColor('#1B6CA8').fontSize(10);
        headers.forEach((h, idx) => doc.text(h, colX[idx], y, { width: colWidths[idx], align: idx === 3 ? 'right' : 'left' }));
        y += 20;
      }

      doc.fillColor('#333333').fontSize(9);
      doc.text(i + 1, colX[0], y);
      doc.text(new Date(r.paid_at).toLocaleDateString('ru-RU'), colX[1], y);
      doc.text(r.patient, colX[2], y, { width: colWidths[2], height: 12, ellipsis: true });
      doc.text(new Intl.NumberFormat('ru-RU').format(r.amount), colX[3], y, { width: colWidths[3], align: 'right' });
      doc.text(methodLabels[r.payment_method] || r.payment_method, colX[4], y);
      doc.text(r.status === 'paid' ? 'Оплачено' : r.status, colX[5], y);

      total += parseFloat(r.amount);
      y += 20;
    });

    // Total
    doc.moveDown(1);
    doc.moveTo(30, y).lineTo(560, y).strokeColor('#1B6CA8').stroke();
    y += 10;
    doc.fillColor('#0D6E1A').fontSize(12).text(`ИТОГО: ${new Intl.NumberFormat('ru-RU').format(total)} сом`, 30, y, { align: 'right', width: 530 });

    doc.end();
  } catch (err) {
    console.error('[exportPdf]', err);
    res.status(500).json({ error: 'Ошибка генерации PDF' });
  }
};

// ── GET /api/finance/export/excel ─────────────────────────
exports.exportExcel = async (req, res) => {
  const ExcelJS = require('exceljs');
  const { from, to } = req.query;

  try {
    const rowsRes = await query(
      `SELECT p.paid_at, pt.last_name || ' ' || pt.first_name AS patient,
              p.amount, p.payment_method, p.status,
              u.last_name || ' ' || u.first_name AS received_by,
              p.notes
       FROM payments p
       JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN users u ON u.id = p.received_by
       WHERE ($1::date IS NULL OR p.paid_at::date >= $1)
         AND ($2::date IS NULL OR p.paid_at::date <= $2)
       ORDER BY p.paid_at`,
      [from || null, to || null]
    );
    const rows = rowsRes.rows;

    const methodLabels = { cash: 'Наличные', card: 'Банковская карта', transfer: 'Перевод' };
    const statusLabels = { paid: 'Оплачено', pending: 'Ожидает', refunded: 'Возврат' };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Финансовый отчёт');

    ws.columns = [
      { header: '№', key: 'id', width: 5 },
      { header: 'Дата и время', key: 'date', width: 20 },
      { header: 'Пациент', key: 'patient', width: 35 },
      { header: 'Сумма (сом)', key: 'amount', width: 15 },
      { header: 'Метод оплаты', key: 'method', width: 20 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Принял', key: 'received_by', width: 25 },
      { header: 'Примечание', key: 'notes', width: 30 },
    ];

    // Style Header
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } };
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    let total = 0;
    rows.forEach((r, i) => {
      const row = ws.addRow({
        id: i + 1,
        date: new Date(r.paid_at).toLocaleString('ru-RU'),
        patient: r.patient,
        amount: parseFloat(r.amount),
        method: methodLabels[r.payment_method] || r.payment_method,
        status: statusLabels[r.status] || r.status,
        received_by: r.received_by || '—',
        notes: r.notes || ''
      });
      total += parseFloat(r.amount);

      // Amount format
      row.getCell('amount').numFmt = '#,##0';
    });

    // Add Total Row
    const totalRow = ws.addRow({ patient: 'ИТОГО:', amount: total });
    totalRow.getCell('patient').font = { bold: true };
    totalRow.getCell('amount').font = { bold: true, color: { argb: 'FF0D6E1A' } };
    totalRow.getCell('amount').numFmt = '#,##0';

    // Auto-width adjustment (simple version)
    ws.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const len = cell.value ? cell.value.toString().length : 0;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(Math.max(column.width, maxLen + 2), 50);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=finance_report.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportExcel]', err);
    res.status(500).json({ error: 'Ошибка экспорта Excel' });
  }
};
