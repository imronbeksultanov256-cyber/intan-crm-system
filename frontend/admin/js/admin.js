// ── MAIN APP CONTROLLER ────────────────────────────────────
const App = {
  user: null,

  async init() {
    const token = api.getToken();
    if (token) {
      api.setToken(token);
      try {
        const me = await api.me();
        if (me) {
          App.user = me;
          App.showApp();
          return;
        }
      } catch (err) {
        console.info('Нет сессии:', err.message);
        App.clearAuthData();
      }
    }
    App.showAuth();
  },

  showAuth() {
    const authScreen = document.getElementById('authScreen');
    const appEl      = document.getElementById('app');
    if (authScreen) { authScreen.hidden = false; authScreen.style.display = 'flex'; }
    if (appEl)      { appEl.hidden = true;        appEl.style.display = 'none'; }
  },

  showApp() {
    const authScreen = document.getElementById('authScreen');
    const appEl      = document.getElementById('app');
    if (authScreen) { authScreen.hidden = true;  authScreen.style.display = 'none'; }
    if (appEl)      { appEl.hidden = false;       appEl.style.display = 'flex'; }
    App.applyRole();
    App.updateSidebar();
    if (typeof window.navigate === 'function') window.navigate('dashboard');
  },

  applyRole() {
    const u = App.user;
    if (!u) return;
    // Роль может прийти как строка "chief_doctor" или объект {name: "chief_doctor"}
    const role = typeof u.role === 'object' && u.role !== null
      ? u.role.name
      : u.role;
    const appEl = document.getElementById('app');
    if (!appEl) return;
    appEl.classList.remove('role-chief', 'role-doctor', 'role-admin');
    if      (role === 'chief_doctor') appEl.classList.add('role-chief');
    else if (role === 'doctor')       appEl.classList.add('role-doctor');
    else if (role === 'admin')        appEl.classList.add('role-admin');
  },

  updateSidebar() {
    const u = App.user;
    if (!u) return;
    const name = `${u.last_name || ''} ${u.first_name || ''}`.trim() || u.email || 'Пользователь';
    const role = typeof u.role === 'object' && u.role !== null ? u.role.name : u.role;
    const roleLabels = {
      chief_doctor: 'Главный врач',
      doctor:       'Врач',
      admin:        'Администратор',
    };
    const nameEl   = document.getElementById('sidebarName');
    const roleEl   = document.getElementById('sidebarRole');
    const avatarEl = document.getElementById('sidebarAvatar');
    if (nameEl)   nameEl.textContent   = name;
    if (roleEl)   roleEl.textContent   = roleLabels[role] || role || '';
    if (avatarEl) {
      // Инициалы без зависимости от UI
      const parts = name.trim().split(' ').filter(Boolean);
      avatarEl.textContent = parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    }
  },

  clearAuthData() {
    api.setToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
    App.user = null;
  },

  async logout() {
    App.clearAuthData();
    try { await api.post('/auth/logout', null, { noRefresh: true }); } catch (_) {}
    App.showAuth();
  },
};

// ── ГЛОБАЛЬНАЯ НАВИГАЦИЯ ───────────────────────────────────
window.navigate = function(pageId, params = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${pageId}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.remove('active');
    if (l.getAttribute('data-page') === pageId) l.classList.add('active');
  });

  const titles = {
    dashboard:    'Дашборд',
    appointments: 'Записи приёмов',
    patients:     'Пациенты',
    'patient-detail': 'Карточка пациента',
    doctors:      'Врачебный состав',
    services:     'Процедуры и цены',
    inventory:    'Склад и материалы',
    finance:      'Финансовая аналитика',
    users:        'Управление сотрудниками',
    logs:         'Журнал действий',
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[pageId] || 'Панель управления';

  const container    = document.getElementById(`page-${pageId}`);
  const functionName = 'load' + pageId.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  if (container && window.Pages && typeof window.Pages[functionName] === 'function') {
    window.Pages[functionName](container, params);
  }
};

// ── BOOT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── LOGIN FORM ────────────────────────────────────────
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email  = document.getElementById('loginEmail')?.value.trim()  || '';
      const pass   = document.getElementById('loginPassword')?.value       || '';
      const errEl  = document.getElementById('authError');
      const btn    = document.getElementById('loginBtn');
      const txt    = document.getElementById('loginBtnText');
      const spin   = document.getElementById('loginSpinner');

      // Базовая проверка до запроса
      if (!email || !pass) {
        if (errEl) errEl.textContent = 'Введите email и пароль';
        return;
      }

      if (errEl) errEl.textContent = '';
      if (btn)   btn.disabled  = true;
      if (txt)   txt.hidden    = true;
      if (spin)  spin.hidden   = false;

      try {
        console.log('Отправляем запрос на вход...');
        const res = await api.login(email, pass);
        console.log('Ответ сервера:', JSON.stringify(res));

        // Защита от null
        if (!res) {
          if (errEl) errEl.textContent = 'Сервер не ответил. Попробуйте позже.';
          return;
        }

        // Токен может быть accessToken или token
        const token = res.accessToken || res.token || null;
        if (!token) {
          if (errEl) errEl.textContent = res.error || res.message || 'Нет токена в ответе';
          return;
        }

        // Refresh token
        const refresh = res.refreshToken || res.refresh_token || null;
        if (refresh) localStorage.setItem('refresh_token', refresh);

        api.setToken(token);
        App.user = res.user || null;

        console.log('Вход успешен, пользователь:', JSON.stringify(App.user));
        App.showApp();

      } catch (err) {
        console.error('Ошибка входа:', err.message);
        if (errEl) errEl.textContent = err.message || 'Неверный email или пароль';
      } finally {
        if (btn)  btn.disabled = false;
        if (txt)  txt.hidden   = false;
        if (spin) spin.hidden  = true;
      }
    });
  }

  // ── NAV ───────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link, .sidebar__logo');
    if (link) {
      e.preventDefault();
      window.navigate(link.getAttribute('data-page') || 'dashboard');
    }
  });

  // ── EYE TOGGLE ───────────────────────────────────────
  document.getElementById('eyeBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // ── LOGOUT ───────────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Выйти из системы?')) App.logout();
  });

  // ── ТЕМА ─────────────────────────────────────────────
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  document.getElementById('themeBtn')?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme');
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });

  function updateThemeIcon(t) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = t === 'light' ? '🌙' : '☀️';
  }

  // ── SIDEBAR ───────────────────────────────────────────
  const sidebar     = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('sidebarCollapse');
  const main        = document.getElementById('main');

  collapseBtn?.addEventListener('click', () => {
    if (!sidebar || !main) return;
    sidebar.classList.toggle('collapsed');
    main.style.marginLeft = sidebar.classList.contains('collapsed') ? '60px' : 'var(--sidebar-w)';
  });

  document.getElementById('mobileBurger')?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
  });

  // ── MODAL ─────────────────────────────────────────────
  document.getElementById('modalClose')?.addEventListener('click', () => {
    if (typeof UI !== 'undefined') UI.closeModal();
  });
  document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) {
      if (typeof UI !== 'undefined') UI.closeModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && typeof UI !== 'undefined') UI.closeModal();
  });

  // ── СТАРТ ─────────────────────────────────────────────
  App.init();
});