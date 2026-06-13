const { query } = require('../utils/db');

// ── GET /api/finance/dashboard ────────────────────────────
exports.dashboard = async (req, res) => {
  try {
    const [today, week, month, year, topServices, doctors] = await Promise.all([
      // Today stats
      query(`SELECT * FROM v_today_stats`),

      // This week revenue
      query(`
        SELECT COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS payments
        FROM payments
        WHERE paid_at >= DATE_TRUNC('week', CURRENT_DATE)
          AND status = 'paid'
          AND is_refunded = FALSE
      `),

      // This month daily breakdown
      query(`SELECT * FROM v_monthly_revenue`),

      // Yearly stats
      query(`
        SELECT COALESCE(SUM(amount),0) AS revenue, COUNT(*) AS payments
        FROM payments
        WHERE paid_at >= DATE_TRUNC('year', CURRENT_DATE)
          AND status = 'paid'
          AND is_refunded = FALSE
      `),

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

      // Doctor stats this month - improved with avg_check
      query(`
        SELECT 
          u.first_name || ' ' || u.last_name AS doctor_name,
          d.specialization,
          (
            SELECT COUNT(*) 
            FROM appointments a 
            WHERE a.doctor_id = d.id 
              AND a.appointment_dt >= DATE_TRUNC('month', CURRENT_DATE) 
              AND a.status = 'completed'
          ) AS appointments,
          COALESCE(
            (
              SELECT SUM(p.amount) 
              FROM payments p
              JOIN treatment_records tr ON tr.id = p.treatment_record_id
              WHERE tr.doctor_id = d.id 
                AND tr.visit_date >= DATE_TRUNC('month', CURRENT_DATE)
                AND p.status = 'paid'
                AND p.is_refunded = FALSE
            ), 0
          ) AS revenue,
          COALESCE(
            (
              SELECT AVG(p.amount) 
              FROM payments p
              JOIN treatment_records tr ON tr.id = p.treatment_record_id
              WHERE tr.doctor_id = d.id 
                AND tr.visit_date >= DATE_TRUNC('month', CURRENT_DATE)
                AND p.status = 'paid'
                AND p.is_refunded = FALSE
            ), 0
          ) AS avg_check
        FROM doctors d
        JOIN users u ON u.id = d.user_id
        ORDER BY revenue DESC
      `),
    ]);

    res.json({
      today: today.rows[0],
      week: week.rows[0],
      year: year.rows[0],
      monthlyChart: month.rows,
      topServices: topServices.rows,
      doctorStats: doctors.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при загрузке статистики' });
  }
};

// ── GET /api/finance/debts ─────────────────────────────
exports.getDebts = async (req, res) => {
  try {
    const result = await query(`SELECT * FROM v_patient_debt_details WHERE current_debt > 0 ORDER BY current_debt DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении списка должников' });
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
         AND p.status = 'paid'
         AND p.is_refunded = FALSE
       ORDER BY p.paid_at`,
      [from || null, to || null]
    );
    const rows = rowsRes.rows;

    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    
    // Font Handling: Prefer Roboto, fallback to Windows Arial
    const fontPath = path.join(__dirname, '../utils/Roboto-Regular.ttf');
    const fallbackFont = 'C:/Windows/Fonts/arial.ttf';
    
    if (fs.existsSync(fontPath) && fs.statSync(fontPath).size > 1000) {
      doc.registerFont('MainFont', fontPath);
    } else if (fs.existsSync(fallbackFont)) {
      doc.registerFont('MainFont', fallbackFont);
    }
    
    doc.font('MainFont');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=finance_report.pdf`);
    doc.pipe(res);

    // --- LOGO (Vector Tooth) ---
    doc.save();
    doc.translate(30, 30);
    doc.path('M10 5 C5 5 2 8 2 13 C2 16 3 18 4 20 C5 23 5 25 6 28 C7 30 8 32 10 32 C11 32 12 31 13 30 C13 29 14 27 15 27 C16 27 16 29 17 30 C18 31 19 32 20 32 C22 32 23 30 24 28 C25 25 25 23 26 20 C27 18 28 16 28 13 C28 8 25 5 20 5 C18 5 16 6 15 7 C14 6 12 5 10 5 Z')
       .fill('#0ea5e9');
    doc.restore();

    // Header
    doc.fillColor('#1B4F72').fontSize(20).text('Финансовый отчёт клиники «Интан»', 70, 40);
    doc.moveDown(0.2);
    doc.fillColor('#666666').fontSize(10).text(`Период: ${from || 'начало'} — ${to || 'сегодня'} | Сгенерировано: ${new Date().toLocaleString('ru-RU')}`, 70, 65);
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
        doc.fillColor('#1B6CA8').fontSize(10);
        headers.forEach((h, idx) => doc.text(h, colX[idx], y, { width: colWidths[idx], align: idx === 3 ? 'right' : 'left' }));
        y += 20;
      }

      doc.fillColor(i % 2 === 0 ? '#FFFFFF' : '#F9FAFB').rect(30, y - 5, 530, 20).fill();
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
         AND p.status = 'paid'
         AND p.is_refunded = FALSE
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
      { header: 'Дата и время', key: 'date', width: 25 },
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
        date: new Date(r.paid_at),
        patient: r.patient,
        amount: parseFloat(r.amount),
        method: methodLabels[r.payment_method] || r.payment_method,
        status: statusLabels[r.status] || r.status,
        received_by: r.received_by || '—',
        notes: r.notes || ''
      });
      total += parseFloat(r.amount);

      // Formatting
      row.getCell('date').numFmt = 'dd.mm.yyyy hh:mm';
      row.getCell('amount').numFmt = '#,##0.00 "сом"';
    });

    // Add Total Row
    ws.addRow([]);
    const totalRow = ws.addRow({ patient: 'ИТОГО К ВЫПЛАТЕ:', amount: total });
    totalRow.getCell('patient').font = { bold: true };
    totalRow.getCell('amount').font = { bold: true, color: { argb: 'FF0D6E1A' } };
    totalRow.getCell('amount').numFmt = '#,##0.00 "сом"';

    // Auto-width adjustment
    ws.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const len = cell.value ? cell.value.toString().length : 10;
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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=finance_report.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportExcel]', err);
    res.status(500).json({ error: 'Ошибка экспорта Excel' });
  }
};
