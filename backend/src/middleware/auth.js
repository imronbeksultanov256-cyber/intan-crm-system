const jwt = require('jsonwebtoken');

// ── ROLE PERMISSIONS MAP ───────────────────────────────────
const PERMISSIONS = {
  chief_doctor: [
    'patients:read', 'patients:write', 'patients:delete',
    'doctors:read', 'doctors:write', 'doctors:delete',
    'admins:read', 'admins:write',
    'appointments:read', 'appointments:write', 'appointments:delete',
    'services:read', 'services:write',
    'treatments:read', 'treatments:write',
    'files:read', 'files:write',
    'finance:read',
    'reports:read',
    'settings:read', 'settings:write',
    'logs:read',
    'users:read', 'users:write',
  ],
  doctor: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'treatments:read', 'treatments:write',
    'files:read', 'files:write',
    'services:read',
  ],
  admin: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write', 'appointments:delete',
    'services:read',
    'doctors:read',
    'files:read',
  ],
  registrar: [
    'patients:read', 'patients:write',
    'appointments:read', 'appointments:write',
    'leads:read', 'leads:write',
    'services:read',
    'doctors:read',
  ],
};

const { query } = require('../utils/db');

// ── AUTHENTICATE TOKEN ─────────────────────────────────────
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен авторизации не предоставлен' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Проверяем активность и статус пользователя в БД в реальном времени
    const userCheck = await query('SELECT is_active, status FROM users WHERE id = $1', [decoded.id]);
    const dbUser = userCheck.rows[0];
    
    const blockedStatuses = ['archived', 'terminated', 'suspended', 'inactive'];
    
    if (!dbUser || !dbUser.is_active || blockedStatuses.includes(dbUser.status)) {
      return res.status(401).json({ error: 'Учетная запись отключена, заблокирована или удалена' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Сессия истекла. Войдите снова.' });
    }
    return res.status(403).json({ error: 'Недействительный токен' });
  }
};

// ── AUTHORIZE BY PERMISSION ────────────────────────────────
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(403).json({ error: 'Роль пользователя не определена' });
    }

    const userPermissions = PERMISSIONS[userRole] || [];
    const hasAll = requiredPermissions.every(p => userPermissions.includes(p));

    if (!hasAll) {
      return res.status(403).json({
        error: 'Недостаточно прав для выполнения данного действия',
        required: requiredPermissions,
        yourRole: userRole,
      });
    }
    next();
  };
};

// ── RESTRICT TO ROLES ──────────────────────────────────────
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Доступ запрещён для вашей роли' });
    }
    next();
  };
};

// ── DOCTOR SELF-ONLY ACCESS ────────────────────────────────
// Allows doctors to access only their own resources; chief_doctor sees all
const doctorOrChief = (req, res, next) => {
  const { role, doctorId } = req.user;
  if (role === 'chief_doctor') return next();
  if (role === 'doctor') {
    req.filterDoctorId = doctorId;
    return next();
  }
  return res.status(403).json({ error: 'Доступ запрещён' });
};

module.exports = { authenticate, authorize, requireRole, doctorOrChief, PERMISSIONS };
