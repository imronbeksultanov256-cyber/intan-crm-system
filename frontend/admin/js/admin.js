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
        console.info('Сессия не найдена, требуется вход:', err.message);
        App.clearAuthData();
      }
    }
    App.showAuth();
  },

  showAuth() {
    const authScreen = document.getElementById('authScreen');
    const appEl      = document.getElementById('app');

    if (authScreen) {
      authScreen.hidden       = false;
      authScreen.style.display = 'flex';
    }
    if (appEl) {
      appEl.hidden       = true;
      appEl.style.display = 'none';
    }
  },

  showApp() {
    const authScreen = document.getElementById('authScreen');
    const appEl      = document.getElementById('app');

    if (authScreen) {
      authScreen.hidden       = true;
      authScreen.style.display = 'none';
    }
    if (appEl) {
      appEl.hidden       = false;
      appEl.style.display = 'flex';
    }

    App.applyRole();
    App.updateSidebar();

    if (typeof window.navigate === 'function') {
      window.navigate('dashboard');
    }
  },

  applyRole() {
    const roleObj = App.user?.role;
    const roleName = typeof roleObj === 'object' && roleObj !== null ? roleObj.name : roleObj;
    
    const appEl = document.getElementById('app');
    if (!appEl) return;

    appEl.classList.remove('role-chief', 'role-doctor', 'role-admin');
    if      (roleName === 'chief_doctor') appEl.classList.add('role-chief');
    else if (roleName === 'doctor')       appEl.classList.add('role-doctor');
    else if (roleName === 'admin')        appEl.classList.add('role-admin');
  },

  updateSidebar() {
    const u = App.user;
    if (!u) return;

    const name = `${u.last_name || ''} ${u.first_name || ''}`.trim() || u.email;
    const roleName = typeof u.role === 'object' && u.role !== null ? u.role.name : u.role;

    const roleLabels = {
      chief_doctor: 'Главный врач',
      doctor:       'Врач',
      admin:        'Администратор',
    };

    const nameEl   = document.getElementById('sidebarName');
    const roleEl   = document.getElementById('sidebarRole');
    const avatarEl = document.getElementById('sidebarAvatar');

    if (nameEl)   nameEl.textContent   = name;
    if (roleEl)   roleEl.textContent   = roleLabels[roleName] || roleName || 'Сотрудник';
    
    if (avatarEl) {
      if (typeof UI !== 'undefined' && typeof UI.initials === 'function') {
        avatarEl.textContent = UI.initials(name);
      } else {
        avatarEl.textContent = ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || '??';
      }
    }
  },

  clearAuthData() {
    api.setToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    App.user = null;

    const nameEl   = document.getElementById('sidebarName');
    const roleEl   = document.getElementById('sidebarRole');
    const avatarEl = document.getElementById('sidebarAvatar');
    if (nameEl)   nameEl.textContent   = 'Загрузка...';
    if (roleEl)   roleEl.textContent   = '';
    if (avatarEl) avatarEl.textContent = '??';
  },

  async logout() {
    App.clearAuthData();
    try {
      await api.post('/auth/logout', null, { noRefresh: true });
    } catch (_) {}
    App.showAuth();
  },
};

// ── ГЛОБАЛЬНАЯ НАВИГАЦИЯ ───────────────────────────────────
window.navigate = function(pageId) {
  console.log('Переключение на страницу:', pageId);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${pageId}`);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-page') === pageId) {
      link.classList.add('active');
    }
  });

  const titles = {
    dashboard:    'Дашборд',
    appointments: 'Записи приёмов',
    patients:     'Пациенты',
    doctors:      'Врачебный состав',
    services:     'Прайс-лист услуг',
    finance:      'Финансовая аналитика',
    users:        'Управление сотрудниками',
    logs:         'Журнал действий',
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[pageId] || 'Панель управления';

  const container    = document.getElementById(`page-${pageId}`);
  const functionName = `load${pageId.charAt(0).toUpperCase() + pageId.slice(1)}`;

  if (container && window.Pages && typeof window.Pages[functionName] === 'function') {
    window.Pages[functionName](container);
  }
};

// ── BOOT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── LOGIN FORM ────────────────────────────────────────
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email  = document.getElementById('loginEmail').value.trim();
      const pass   = document.getElementById('loginPassword').value;
      const errEl  = document.getElementById('authError');
      const btn    = document.getElementById('loginBtn');
      const txt    = document.getElementById('loginBtnText');
      const spin   = document.getElementById('loginSpinner');

      if (errEl) errEl.textContent = '';
      if (btn)  btn.disabled  = true;
      if (txt)  txt.hidden    = true;
      if (spin) spin.hidden   = false;

      try {
        const res = await api.login(email, pass);
        api.setToken(res.accessToken || res.token);
        localStorage.setItem('refresh_token', res.refreshToken);
        if (res.user) localStorage.setItem('user', JSON.stringify(res.user));
        
        App.user = res.user;
        App.showApp();
      } catch (err) {
        if (errEl) errEl.textContent = err.message || 'Неверный email или пароль';
      } finally {
        if (btn)  btn.disabled = false;
        if (txt)  txt.hidden   = false;
        if (spin) spin.hidden  = true;
      }
    });
  }

  // ── NAV КЛИКИ ─────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link, .sidebar__logo');
    if (link) {
      e.preventDefault();
      const page = link.getAttribute('data-page') || 'dashboard';
      window.navigate(page);
    }
  });

  // ── EYE TOGGLE ────────────────────────────────────────
  document.getElementById('eyeBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // ── LOGOUT ────────────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (confirm('Выйти из системы?')) App.logout();
  });

  // ── ТЕМА ──────────────────────────────────────────────
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

  function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  // ── SIDEBAR COLLAPSE ──────────────────────────────────
  const sidebar     = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('sidebarCollapse');
  const main        = document.getElementById('main');

  collapseBtn?.addEventListener('click', () => {
    if (!sidebar || !main) return;
    sidebar.classList.toggle('collapsed');
    main.style.marginLeft = sidebar.classList.contains('collapsed')
      ? '60px'
      : 'var(--sidebar-w)';
  });

  // ── MOBILE BURGER ─────────────────────────────────────
  document.getElementById('mobileBurger')?.addEventListener('click', () => {
    if (sidebar) sidebar.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!sidebar) return;
    const burger = document.getElementById('mobileBurger');
    if (
      window.innerWidth <= 768 &&
      sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      (!burger || !burger.contains(e.target))
    ) {
      sidebar.classList.remove('open');
    }
  });

  // ── MODAL CLOSE ───────────────────────────────────────
  document.getElementById('modalClose')?.addEventListener('click', () => {
    if (typeof UI !== 'undefined' && typeof UI.closeModal === 'function') UI.closeModal();
  });
  document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) {
      if (typeof UI !== 'undefined' && typeof UI.closeModal === 'function') UI.closeModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && typeof UI !== 'undefined' && typeof UI.closeModal === 'function') UI.closeModal();
  });

  // ── СТАРТ ─────────────────────────────────────────────
  App.init();
});