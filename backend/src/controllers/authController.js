const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

const generateTokens = (user) => {
  const payload = {
    id:       user.id,
    role:     user.role_name,
    email:    user.email,
    doctorId: user.doctor_id || null,
  };

  // Проверка переменной окружения, чтобы сервер не падал молча
  if (!process.env.JWT_SECRET) {
    throw new Error('КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения JWT_SECRET не задана в настройках сервера!');
  }

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET + '_refresh',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// ── POST /api/auth/login ───────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  try {
    const result = await query(
      `SELECT u.*, r.name AS role_name, d.id AS doctor_id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE u.email = $1 AND u.is_active = TRUE`,
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const { accessToken, refreshToken } = generateTokens(user);

    // Log activity
    await query(
      `INSERT INTO activity_log (user_id, action, details, ip_address)
       VALUES ($1, 'LOGIN', $2, $3)`,
      [user.id, JSON.stringify({ email: user.email }), req.ip]
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id:         user.id,
        email:      user.email,
        firstName:  user.first_name,
        lastName:   user.last_name,
        role:       user.role_name,
        doctorId:   user.doctor_id,
      },
    });
  } catch (err) {
    // ВЫВОДИМ МАКСИМУМ ИНФОРМАЦИИ В ЛОГИ RENDER ДЛЯ ПОИСКА ОШИБКИ 500
    console.error('=== ДЕТАЛЬНАЯ ОШИБКА АВТОРИЗАЦИИ ===');
    console.error('Сообщение:', err.message || err);
    if (err.stack) console.error('Стек вызова:', err.stack);
    console.error('===================================');
    
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

// ── POST /api/auth/refresh ────────────────────────────────
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token не предоставлен' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh');

    const result = await query(
      `SELECT u.*, r.name AS role_name, d.id AS doctor_id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [decoded.id]
    );

    const user = result.rows[0];
    if (!user) return res.status(403).json({ error: 'Пользователь не найден' });

    const { accessToken } = generateTokens(user);
    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ error: 'Недействительный refresh token' });
  }
};

// ── POST /api/auth/logout ─────────────────────────────────
exports.logout = async (req, res) => {
  if (req.user) {
    await query(
      `INSERT INTO activity_log (user_id, action, ip_address)
       VALUES ($1, 'LOGOUT', $2)`,
      [req.user.id, req.ip]
    ).catch(() => {});
  }
  res.json({ message: 'Выход выполнен успешно' });
};

// ── GET /api/auth/me ──────────────────────────────────────
exports.me = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
              r.name AS role, d.id AS doctor_id, d.specialization
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN doctors d ON d.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
