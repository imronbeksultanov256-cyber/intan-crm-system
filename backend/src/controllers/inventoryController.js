const { query } = require('../utils/db');

exports.list = async (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM inventory_items WHERE is_deleted = FALSE';
  const params = [];

  if (search) {
    sql += ` AND name ILIKE $${params.length + 1}`;
    params.push(`%${search}%`);
  }
  if (category) {
    sql += ` AND category = $${params.length + 1}`;
    params.push(category);
  }

  sql += ' ORDER BY name ASC';

  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении склада' });
  }
};

exports.create = async (req, res) => {
  const { name, category, unit, min_quantity, price_per_unit } = req.body;
  try {
    const result = await query(
      `INSERT INTO inventory_items (name, category, unit, min_quantity, price_per_unit)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, category, unit, min_quantity || 0, price_per_unit || 0]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'CREATE_INVENTORY_ITEM', 'inventory', $2, $3)`,
      [req.user.id, result.rows[0].id, JSON.stringify({name})]
    ).catch(()=>{});

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при создании товара' });
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, category, unit, min_quantity, price_per_unit } = req.body;
  try {
    const result = await query(
      `UPDATE inventory_items SET
         name = $1, category = $2, unit = $3, min_quantity = $4, price_per_unit = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, category, unit, min_quantity, price_per_unit, id]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, new_values)
       VALUES ($1, 'UPDATE_INVENTORY_ITEM', 'inventory', $2, $3)`,
      [req.user.id, id, JSON.stringify({name})]
    ).catch(()=>{});

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при обновлении товара' });
  }
};

exports.transaction = async (req, res) => {
  const { item_id, type, quantity, reason } = req.body;
  const userId = req.user.id;

  try {
    await query('BEGIN');

    // 1. Log transaction
    const trans = await query(
      `INSERT INTO inventory_transactions (item_id, type, quantity, reason, user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [item_id, type, quantity, reason, userId]
    );

    // 2. Update balance
    const sign = type === 'in' ? '+' : '-';
    await query(
      `UPDATE inventory_items SET quantity = quantity ${sign} $1, updated_at = NOW() WHERE id = $2`,
      [quantity, item_id]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'INVENTORY_TRANSACTION', 'inventory', $2, $3)`,
      [userId, item_id, JSON.stringify({type, quantity, reason})]
    ).catch(()=>{});

    await query('COMMIT');
    res.json({ success: true, transaction: trans.rows[0] });
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: 'Ошибка при выполнении операции' });
  }
};

exports.logs = async (req, res) => {
  const { item_id } = req.params;
  try {
    const result = await query(
      `SELECT t.*, u.first_name || ' ' || u.last_name as user_name, i.name as item_name
       FROM inventory_transactions t
       JOIN users u ON u.id = t.user_id
       JOIN inventory_items i ON i.id = t.item_id
       ${item_id ? 'WHERE t.item_id = $1' : ''}
       ORDER BY t.created_at DESC LIMIT 100`,
      item_id ? [item_id] : []
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при получении логов' });
  }
};
