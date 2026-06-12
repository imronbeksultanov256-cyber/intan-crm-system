const { query } = require('../utils/db');

// ── GET /api/services ─────────────────────────────────────
exports.list = async (req, res) => {
  const { category, search, activeOnly = 'true' } = req.query;
  const conditions = [];
  const params = [];
  let pi = 1;

  if (activeOnly === 'true') {
    conditions.push(`s.is_active = TRUE`);
  }
  if (category) {
    conditions.push(`sc.slug = $${pi++}`);
    params.push(category);
  }
  if (search) {
    conditions.push(`s.name ILIKE $${pi++}`);
    params.push(`%${search}%`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const result = await query(
      `SELECT s.*, sc.name AS category_name, sc.slug AS category_slug
       FROM services s
       JOIN service_categories sc ON sc.id = s.category_id
       ${where}
       ORDER BY sc.sort_order, s.sort_order, s.name`,
      params
    );

    // Group by category
    const grouped = {};
    result.rows.forEach(row => {
      if (!grouped[row.category_slug]) {
        grouped[row.category_slug] = {
          name: row.category_name,
          slug: row.category_slug,
          services: [],
        };
      }
      grouped[row.category_slug].services.push(row);
    });

    res.json({ grouped: Object.values(grouped), flat: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при загрузке прайс-листа' });
  }
};

// ── POST /api/services ────────────────────────────────────
exports.create = async (req, res) => {
  const { category_id, name, description, price, duration_min } = req.body;
  if (!category_id || !name || !price) {
    return res.status(400).json({ error: 'Категория, название и цена обязательны' });
  }

  try {
    const result = await query(
      `INSERT INTO services (category_id, name, description, price, duration_min, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [category_id, name, description || null, price, duration_min || 60, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при создании услуги' });
  }
};

// ── PUT /api/services/:id ─────────────────────────────────
exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, description, price, duration_min, is_active } = req.body;

  try {
    const result = await query(
      `UPDATE services SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         duration_min = COALESCE($4, duration_min),
         is_active = COALESCE($5, is_active),
         updated_by = $6,
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, description, price, duration_min, is_active, req.user.id, id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Услуга не найдена' });

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'UPDATE_SERVICE', 'service', $2)`,
      [req.user.id, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при обновлении услуги' });
  }
};

// ── DELETE /api/services/:id ──────────────────────────────
exports.remove = async (req, res) => {
  const { id } = req.params;
  try {
    await query(`UPDATE services SET is_active = FALSE WHERE id = $1`, [id]);
    res.json({ message: 'Услуга деактивирована' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при удалении услуги' });
  }
};

// ── GET /api/services/pdf ─────────────────────────────────
exports.exportPDF = async (req, res) => {
  try {
    const result = await query(
      `SELECT s.name, s.price, s.duration_min, sc.name AS category
       FROM services s JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.is_active = TRUE
       ORDER BY sc.sort_order, s.sort_order`
    );
    // Return JSON for client-side PDF generation
    res.json({
      title: 'Прайс-лист клиники «Интан»',
      generatedAt: new Date().toISOString(),
      services: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка при получении данных' });
  }
};
