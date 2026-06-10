// ── PAGES NAMESPACE ────────────────────────────────────────
window.Pages = window.Pages || {};

// ИСПРАВЛЕНО: Убрана лишняя 'P' в названии функции
Pages.loadDashboard = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="font-size: 24px; font-weight: 700; color: var(--text-1)">Рабочий стол</h1>
        <p style="color: var(--text-3); margin-top: 4px;">Сводка на ${new Date().toLocaleDateString('ru-RU', { weekday:'long', day:'numeric', month:'long' })}</p>
      </div>
      <button class="btn-secondary" onclick="Pages.loadDashboard(document.getElementById('page-dashboard'))">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-8.49"/></svg>
        Обновить данные
      </button>
    </div>
    
    <div id="dashboardContent">
      <!-- Top Stats -->
      <div class="stats-grid" id="statsGrid" style="margin-bottom: 24px">
        ${[1,2,3,4].map(() => `<div class="stat-card">${UI.skeleton(1,1)}</div>`).join('')}
      </div>
      
      <div class="grid-2" style="gap: 24px; align-items: start;">
        
        <!-- Left Column -->
        <div style="display: flex; flex-direction: column; gap: 24px">
          
          <!-- New Leads (Заявки с сайта) -->
          <div class="card" style="border-top: 4px solid var(--c-primary)" id="requestsCard">
            <div class="card__header" style="display:flex; justify-content: space-between; align-items: center">
              <span class="card__title">📩 Новые заявки с сайта</span>
              <button class="btn-ghost btn-xs" onclick="navigate('leads')">Все заявки →</button>
            </div>
            <div class="card__body" id="requestsList" style="padding: 16px">${UI.skeleton(3,2)}</div>
          </div>

          <!-- Upcoming Appointments -->
          <div class="card" id="upcomingCard">
            <div class="card__header" style="display:flex; justify-content: space-between; align-items: center">
              <span class="card__title">📅 Сегодня на приёме</span>
              <button class="btn-ghost btn-xs" onclick="navigate('appointments')">Календарь →</button>
            </div>
            <div class="card__body" style="padding: 16px">${UI.skeleton(5,3)}</div>
          </div>

        </div>

        <!-- Right Column -->
        <div style="display: flex; flex-direction: column; gap: 24px">
          
          <!-- Activity Feed -->
          <div class="card" id="activityCard">
            <div class="card__header"><span class="card__title">⚡ Последняя активность</span></div>
            <div class="card__body" style="padding: 16px">${UI.skeleton(5,2)}</div>
          </div>

          <!-- Quick Actions -->
          <div class="card">
            <div class="card__header"><span class="card__title">🚀 Быстрые действия</span></div>
            <div class="card__body" style="padding: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
              <button class="btn-secondary" style="height: 80px; flex-direction: column; gap: 8px" onclick="navigate('patients')">
                <span style="font-size: 20px">👥</span>
                <span style="font-size: 12px">Пациенты</span>
              </button>
              <button class="btn-secondary" style="height: 80px; flex-direction: column; gap: 8px" onclick="navigate('appointments')">
                <span style="font-size: 20px">📝</span>
                <span style="font-size: 12px">Записать</span>
              </button>
              <button class="btn-secondary" style="height: 80px; flex-direction: column; gap: 8px" onclick="navigate('finance')">
                <span style="font-size: 20px">💰</span>
                <span style="font-size: 12px">Финансы</span>
              </button>
              <button class="btn-secondary" style="height: 80px; flex-direction: column; gap: 8px" onclick="navigate('inventory')">
                <span style="font-size: 20px">📦</span>
                <span style="font-size: 12px">Склад</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  try {
    const [data, allLeads] = await Promise.all([
      api.dashboard(),
      api.leads()
    ]);
    
    if (!data) return;

    // Filter only NEW leads
    const newLeads = (allLeads || []).filter(l => l.status === 'new').slice(0, 5);

    // 1. Counters
    const s = data.stats;
    const statsGrid = document.getElementById('statsGrid');
    if (statsGrid && s) {
      statsGrid.innerHTML = `
        <div class="stat-card stat-card--blue">
          <div class="stat-card__icon">📅</div>
          <div class="stat-card__label">Записи сегодня</div>
          <div class="stat-card__value">${s.todayAppointments || 0}</div>
          <div class="stat-card__sub">${s.todayCompleted || 0} завершено</div>
        </div>
        <div class="stat-card stat-card--green">
          <div class="stat-card__icon">👤</div>
          <div class="stat-card__label">Новые пациенты</div>
          <div class="stat-card__value">${s.newPatientsToday || 0}</div>
          <div class="stat-card__sub">регистраций сегодня</div>
        </div>
        <div class="stat-card stat-card--amber">
          <div class="stat-card__icon">💰</div>
          <div class="stat-card__label">Выручка сегодня</div>
          <div class="stat-card__value">${UI.fmtMoney(s.todayRevenue || 0)}</div>
          <div class="stat-card__sub">подтверждённые оплаты</div>
        </div>
        <div class="stat-card stat-card--purple">
          <div class="stat-card__icon">🔥</div>
          <div class="stat-card__label">Новые заявки</div>
          <div class="stat-card__value">${newLeads.length}</div>
          <div class="stat-card__sub">ждут обработки</div>
        </div>
      `;
    }

    // 2. New Leads List
    const reqList = document.getElementById('requestsList');
    if (reqList) {
      if (newLeads.length) {
        reqList.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:8px">
            ${newLeads.map(l => `
              <div style="display:flex; align-items:center; justify-content: space-between; padding: 12px; background: var(--surface-2); border-radius: 12px; border: 1px solid var(--surface-3)">
                <div>
                  <div style="font-weight:600; font-size: 14px; color: var(--text-1)">${l.name}</div>
                  <div style="font-size:12px; color:var(--text-3); margin-top: 2px">${l.phone} · ${UI.fmtDateTime(l.created_at)}</div>
                </div>
                <button class="btn-primary btn-sm" onclick="navigate('leads')">Связаться</button>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        reqList.innerHTML = UI.empty('📩', 'Новых заявок нет', 'Все заявки с сайта обработаны');
      }
    }

    // 3. Upcoming Appointments
    const upEl = document.getElementById('upcomingCard');
    if (upEl) {
      const upcoming = (data.upcoming || []).filter(a => a.appointment_dt);
      if (upcoming.length) {
        upEl.innerHTML = `
          <div class="card__header" style="display:flex; justify-content: space-between; align-items: center">
            <span class="card__title">📅 Сегодня на приёме</span>
            <button class="btn-ghost btn-xs" onclick="navigate('appointments')">Весь день →</button>
          </div>
          <div class="card__body" style="padding: 0">
            <div class="mini-calendar">
              ${upcoming.map(a => `
                <div class="cal-slot cal-slot--${a.status}" style="border: none; border-bottom: 1px solid var(--surface-3); padding: 12px 16px; border-radius: 0">
                  <span class="cal-slot__time" style="font-weight: 700; color: var(--c-primary); width: 60px">${new Date(a.appointment_dt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span>
                  <div style="flex: 1">
                    <div class="cal-slot__patient" style="font-size: 14px; font-weight: 600">${a.patient_name}</div>
                    <div class="cal-slot__doctor" style="font-size: 12px; color: var(--text-3)">${a.doctor_name}</div>
                  </div>
                  ${UI.badge(a.status)}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        upEl.innerHTML = `
          <div class="card__header"><span class="card__title">📅 Сегодня на приёме</span></div>
          <div class="card__body" style="padding: 16px">${UI.empty('📅','Нет записей на сегодня','На сегодня приёмов не запланировано')}</div>
        `;
      }
    }

    // 4. Activity
    const actEl = document.getElementById('activityCard');
    if (actEl) {
      const actionLabels = {
        LOGIN: '🔐 Вход', LOGOUT: '🚪 Выход', CREATE_PATIENT: '👤 Новый пациент',
        UPDATE_PATIENT: '✏️ Обновление пациента', CREATE_APPOINTMENT: '📅 Новая запись',
        UPDATE_SERVICE: '💲 Изменение прайса', DELETE_USER: '🗑 Удаление сотрудника',
        soft_delete_patient: '🗑 В корзину', restore_patient: '♻️ Восстановление'
      };
      
      actEl.innerHTML = `
        <div class="card__header"><span class="card__title">⚡ Последняя активность</span></div>
        <div class="card__body" style="padding: 16px">
          ${data.recentActivity && data.recentActivity.length ? `
            <div style="display:flex;flex-direction:column;gap:12px">
              ${data.recentActivity.map(a => `
                <div style="display:flex;align-items:center;gap:12px;font-size:13px">
                  <div style="width: 32px; height: 32px; background: var(--surface-3); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px">
                    ${(actionLabels[a.action] || '⚡').split(' ')[0]}
                  </div>
                  <div style="flex:1">
                    <div style="font-weight:600; color: var(--text-1)">${(actionLabels[a.action] || a.action).split(' ').slice(1).join(' ') || a.action}</div>
                    <div style="color:var(--text-3);font-size:11px">${a.user_name || 'Система'}</div>
                  </div>
                  <div style="color:var(--text-3);font-size:11px;white-space:nowrap">${UI.fmtDateTime(a.created_at)}</div>
                </div>
              `).join('')}
            </div>
          ` : UI.empty('📋','Действий пока нет')}
        </div>
      `;
    }
  } catch (err) {
     console.error('[Dashboard Error]', err);
  }
};

// ── УДАЛЕНО: loadDoctors (теперь в doctors.js) ──────────────────

// ── СОТРУДНИКИ ─────────────────────────────────────────────
Pages.loadUsers = async (el) => {
  const isChief = App.user?.role === 'chief_doctor';
  if (!isChief) {
    el.innerHTML = UI.empty('🔒','Доступ запрещён','Только для главного врача');
    return;
  }

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Сотрудники</h1></div>
      <div style="display:flex;gap:10px">
        <select class="form-select" id="staffRoleFilter" style="width:160px">
          <option value="">Все роли</option>
          <option value="chief_doctor">Главный врач</option>
          <option value="doctor">Врач</option>
          <option value="admin">Администратор</option>
        </select>
        <button class="btn-primary" onclick="Pages.showAddUserModal()">+ Добавить</button>
      </div>
    </div>
    <div class="card">
      <div class="card__body" id="usersTable">${UI.skeleton(5,5)}</div>
    </div>
  `;

  let allUsers = [];

  const render = (role) => {
    const filtered = role ? allUsers.filter(u => u.role === role) : allUsers;
    const tbl = document.getElementById('usersTable');
    if (!filtered?.length) { tbl.innerHTML = UI.empty('👥','Сотрудники не найдены'); return; }

    tbl.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Сотрудник</th><th>Email</th><th>Роль</th><th>Телефон</th><th>Статус</th><th style="text-align:right">Действия</th>
          </tr></thead>
          <tbody>
            ${filtered.map(u => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="user-card__avatar" style="width:32px;height:32px;font-size:11px">
                      ${UI.initials(u.last_name + ' ' + u.first_name)}
                    </div>
                    <div style="display:flex;flex-direction:column">
                      <span style="font-weight:600">${u.last_name} ${u.first_name}</span>
                      <span style="font-size:10px;color:var(--text-3)">Вход: ${UI.fmtDateTime(u.last_login)}</span>
                    </div>
                  </div>
                </td>
                <td style="color:var(--text-2)">${u.email}</td>
                <td>${UI.badge(u.role)}</td>
                <td style="color:var(--text-3)">${u.phone || '—'}</td>
                <td>
                  <span class="badge ${u.is_active ? 'badge--confirmed' : 'badge--cancelled'}">
                    ${u.is_active ? 'Активен' : 'Отключён'}
                  </span>
                </td>
                <td style="text-align:right">
                   ${u.id !== App.user?.id ? `
                     <button class="btn-icon" title="Удалить" style="color:var(--c-danger)" onclick="Pages.deleteUser('${u.id}', '${u.last_name} ${u.first_name}')">✕</button>
                   ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  try {
    allUsers = await api.users();
    render();
    document.getElementById('staffRoleFilter').addEventListener('change', (e) => render(e.target.value));
  } catch (e) {
    document.getElementById('usersTable').innerHTML = UI.empty('⚠️','Ошибка загрузки');
  }
};

Pages.deleteUser = async (id, name) => {
  if (!confirm(`Вы уверены, что хотите удалить сотрудника ${name}?`)) return;
  try {
    await api.del(`/users/${id}`);
    UI.toast('Сотрудник удалён', 'success');
    Pages.loadUsers(document.getElementById('page-users'));
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

// ── МОДАЛЬНОЕ ОКНО СОЗДАНИЯ СОТРУДНИКА ───────────────────────
Pages.showAddUserModal = () => {
  UI.showModal('Добавить сотрудника', `
    <form id="addUserForm" style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Фамилия *</label>
          <input class="form-input" name="last_name" required />
        </div>
        <div class="form-group">
          <label class="form-label">Имя *</label>
          <input class="form-input" name="first_name" required />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input class="form-input" type="email" name="email" required />
      </div>
      <div class="form-group">
        <label class="form-label">Пароль *</label>
        <input class="form-input" type="password" name="password" required minlength="6" />
      </div>
      <div class="form-group">
        <label class="form-label">Роль *</label>
        <select class="form-select" name="role_id" required>
          <option value="2">Врач</option>
          <option value="3">Администратор</option>
          <option value="1">Главный врач</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Телефон</label>
        <input class="form-input" name="phone" type="tel" placeholder="+996 XXX XXX XXX" />
      </div>
      <button type="submit" class="btn-primary">Создать сотрудника</button>
    </form>
  `);

  document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    try {
      await api.createUser(body);
      UI.closeModal();
      UI.toast('Сотрудник создан', 'success');
      Pages.loadUsers(document.getElementById('page-users'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

// ── ЖУРНАЛ ДЕЙСТВИЙ ─────────────────────────────────────────
Pages.loadLogs = async (el) => {
  el.innerHTML = `
    <div class="page-header"><div><h1>Журнал действий</h1></div></div>
    <div class="card">
      <div class="card__body" id="logsTable">${UI.skeleton(10,4)}</div>
    </div>
  `;

  try {
    const logs = await api.logs();
    const tbl = document.getElementById('logsTable');
    if (!logs?.length) { tbl.innerHTML = UI.empty('📋','Журнал пуст'); return; }

    const icons = { 
      LOGIN:'🔐', LOGOUT:'🚪', CREATE_PATIENT:'👤', UPDATE_PATIENT:'✏️',
      CREATE_APPOINTMENT:'📅', UPDATE_SERVICE:'💲' 
    };
    
    tbl.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Действие</th><th>Сотрудник</th><th>Роль</th><th>IP</th><th>Время</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${icons[l.action] || '▸'} ${l.action}</td>
                <td>${l.user_name || '—'}</td>
                <td>${l.role ? UI.badge(l.role) : '—'}</td>
                <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-3)">${l.ip_address || '—'}</td>
                <td style="color:var(--text-3)">${UI.fmtDateTime(l.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    document.getElementById('logsTable').innerHTML = UI.empty('⚠️','Ошибка загрузки');
  }
};