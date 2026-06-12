// ── UI UTILITIES ───────────────────────────────────────────

const UI = {
  // Toast notifications
  toast(msg, type = 'info', duration = 3500) {
    const c = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      el.style.transition = '0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  // Modal
  showModal(title, bodyHtml, size = '') {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    const modal = document.getElementById('modal');
    if (size === 'lg') modal.style.maxWidth = '720px';
    else modal.style.maxWidth = '580px';
    document.getElementById('modalOverlay').hidden = false;
  },

  closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.getElementById('modalBody').innerHTML = '';
  },

  // Loading skeleton
  skeleton(rows = 3, cols = 4) {
    const thead = Array(cols).fill('<th><div class="skeleton" style="height:14px;width:80px"></div></th>').join('');
    const tbody = Array(rows).fill(
      `<tr>${Array(cols).fill(`<td><div class="skeleton" style="height:14px;width:${60+Math.random()*60|0}px"></div></td>`).join('')}</tr>`
    ).join('');
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
  },

  // Status badge
  badge(status) {
    const labels = {
      pending:     'Ожидает',
      confirmed:   'Подтверждено',
      completed:   'Завершено',
      cancelled:   'Отменено',
      no_show:     'Не пришёл',
      in_progress: 'Приём',
      chief_doctor:'Главный врач',
      doctor:      'Врач',
      admin:       'Администратор',
    };
    return `<span class="badge badge--${status}">${labels[status] || status}</span>`;
  },

  // Format date
  fmtDate(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  fmtDateTime(dt) {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },
// Format money
fmtMoney(n) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' сом';
},

// Pluralize Russian words
// Usage: UI.plural(5, ['визит', 'визита', 'визитов'])
plural(n, titles) {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[(n % 100 > 4 && n % 100 < 20) ? 2 : cases[(n % 10 < 5) ? n % 10 : 5]];
},

// Initials from name
  initials(name) {
    return name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) : '??';
  },

  // Debounce
  debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  },

  // Confirm dialog
  confirm(msg) {
    return window.confirm(msg);
  },

  // Page loader
  pageLoader() {
    return `<div class="empty-state"><div class="skeleton" style="width:60px;height:60px;border-radius:50%;margin-bottom:16px"></div><div class="skeleton" style="width:200px;height:16px"></div></div>`;
  },

  // Empty state
  empty(icon = '📭', text = 'Ничего не найдено', sub = '') {
    return `<div class="empty-state"><div class="empty-state__icon">${icon}</div><div class="empty-state__text">${text}</div>${sub ? `<div class="empty-state__sub">${sub}</div>` : ''}</div>`;
  },

  // Mini chart bars (sparkline)
  sparkBars(values, maxH = 40) {
    if (!values.length) return '';
    const max = Math.max(...values, 1);
    return values.map(v => {
      const h = Math.max(4, Math.round((v / max) * maxH));
      return `<div style="height:${h}px;flex:1;background:var(--c-primary);border-radius:2px 2px 0 0;opacity:0.6"></div>`;
    }).join('');
  },

  // Escape HTML to prevent XSS
  esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
};

// ── NAVIGATION ─────────────────────────────────────────────

// Геттеры вызывают Pages.load* только в момент перехода на страницу, предотвращая ошибку TDZ
const pages = {
  dashboard:        { title: 'Дашборд',             get loader() { return Pages.loadDashboard; } },
  appointments:     { title: 'Записи на приём',      get loader() { return Pages.loadAppointments; } },
  patients:         { title: 'Пациенты',             get loader() { return Pages.loadPatients; } },
  'patient-detail': { title: 'Карточка пациента',    get loader() { return Pages.loadPatientDetail; } },
  doctors:          { title: 'Врачи',                get loader() { return Pages.loadDoctors; } },
  services:         { title: 'Прайс-лист',           get loader() { return Pages.loadServices; } },
  finance:          { title: 'Финансы',              get loader() { return Pages.loadFinance; } },
  users:            { title: 'Сотрудники',           get loader() { return Pages.loadUsers; } },
  logs:             { title: 'Журнал действий',      get loader() { return Pages.loadLogs; } },
};

let currentPage = null;
let currentPatientId = null;

function navigate(page, params = {}) {
  const pageDef = pages[page];

  // ── Защита: страница не найдена или loader ещё не готов ──
  if (!pageDef) {
    console.warn(`Maps: страница "${page}" не найдена`);
    return;
  }
  if (typeof pageDef.loader !== 'function') {
    console.warn(`Maps: loader для "${page}" не является функцией`);
    return;
  }

  // Скрыть все страницы, показать нужную
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Обновить активную ссылку в сайдбаре
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`[data-page="${page}"]`);
  if (activeLink) activeLink.classList.add('active');

  const el = document.getElementById(`page-${page}`);
  if (!el) {
    console.warn(`Maps: элемент #page-${page} не найден в DOM`);
    return;
  }
  el.classList.add('active');

  document.getElementById('pageTitle').textContent = pageDef.title;
  pageDef.loader(el, params);

  currentPage = page;
  if (params.patientId) currentPatientId = params.patientId;
}