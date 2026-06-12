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
// Returns JSON data for client-side PDF generation
exports.exportPdf = async (req, res) => {
  const { from, to } = req.query;

  try {
    const rows = await query(
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

    // Return structured JSON for client-side PDF generation
    res.json({
      title: 'Финансовый отчёт клиники «Интан»',
      period: { from: from || null, to: to || null },
      generatedAt: new Date().toISOString(),
      rows: rows.rows,
      total: rows.rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
};

// ── GET /api/finance/export/excel ─────────────────────────
exports.exportExcel = async (req, res) => {
  const ExcelJS = require('exceljs');
  const { from, to } = req.query;

  try {
    const rows = await query(
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

    const methodLabels = { cash: 'Наличные', card: 'Банковская карта', transfer: 'Перевод' };
    const statusLabels = { paid: 'Оплачено', pending: 'Ожидает', refunded: 'Возврат' };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Интан CRM';
    const ws = wb.addWorksheet('Финансовый отчёт');

    // Title row
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `Финансовый отчёт клиники «Интан»`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF1B4F72' } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Period row
    ws.mergeCells('A2:G2');
    const periodCell = ws.getCell('A2');
    periodCell.value = `Период: ${from ? new Date(from).toLocaleDateString('ru-RU') : 'начало'} — ${to ? new Date(to).toLocaleDateString('ru-RU') : 'сегодня'}`;
    periodCell.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
    periodCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    // Empty row
    ws.addRow([]);

    // Header row
    const headerRow = ws.addRow(['№', 'Дата и время', 'Пациент', 'Сумма (сом)', 'Способ оплаты', 'Статус', 'Принял']);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B6CA8' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    headerRow.height = 22;

    // Data rows
    let total = 0;
    rows.rows.forEach((r, i) => {
      const dataRow = ws.addRow([
        i + 1,
        r.paid_at ? new Date(r.paid_at).toLocaleString('ru-RU') : '—',
        r.patient,
        parseFloat(r.amount),
        methodLabels[r.payment_method] || r.payment_method,
        statusLabels[r.status] || r.status,
        r.received_by || '—'
      ]);
      total += parseFloat(r.amount) || 0;

      const isEven = (i % 2 === 0);
      dataRow.eachCell((cell, colIdx) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF0F7FF' : 'FFFFFFFF' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD0D7DE' } },
          bottom: { style: 'thin', color: { argb: 'FFD0D7DE' } },
          left: { style: 'thin', color: { argb: 'FFD0D7DE' } },
          right: { style: 'thin', color: { argb: 'FFD0D7DE' } }
        };
        if (colIdx === 4) { // Amount column
          cell.numFmt = '#,##0';
          cell.font = { bold: true, color: { argb: 'FF1B6CA8' } };
        }
      });
    });

    // Total row
    const totalRow = ws.addRow(['', '', 'ИТОГО:', total, '', '', '']);
    totalRow.getCell(3).font = { bold: true };
    totalRow.getCell(4).font = { bold: true, size: 12, color: { argb: 'FF0D6E1A' } };
    totalRow.getCell(4).numFmt = '#,##0';
    totalRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    totalRow.height = 20;

    // Summary row
    ws.addRow([]);
    const genRow = ws.addRow([`Сформировано: ${new Date().toLocaleString('ru-RU')} | Платежей: ${rows.rows.length}`]);
    ws.mergeCells(`A${genRow.number}:G${genRow.number}`);
    genRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF999999' } };

    // Column widths
    ws.columns = [
      { key: 'num',    width: 5 },
      { key: 'date',   width: 22 },
      { key: 'pat',    width: 32 },
      { key: 'amt',    width: 16 },
      { key: 'meth',   width: 20 },
      { key: 'stat',   width: 14 },
      { key: 'recv',   width: 24 },
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''finance_${from||'all'}_${to||'all'}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при экспорте Excel' });
  }
};
