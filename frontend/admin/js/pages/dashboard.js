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
    let allLeads = [];
    let data = null;

    try {
      const results = await Promise.allSettled([
        api.dashboard(),
        api.leads()
      ]);
      
      if (results[0].status === 'fulfilled') {
        data = results[0].value;
      } else {
        console.warn('[Dashboard] Dashboard stats failed', results[0].reason);
      }

      if (results[1].status === 'fulfilled') {
        allLeads = results[1].value;
      } else {
        console.warn('[Dashboard] Leads failed', results[1].reason);
      }
    } catch (err) {
      console.error('[Dashboard Error]', err);
    }
    
    if (!data) {
       document.getElementById('dashboardContent').innerHTML = UI.empty('⚠️', 'Ошибка загрузки данных', 'Не удалось получить статистику с сервера');
       return;
    }

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
  const isAdmin = App.user?.role === 'admin';
  if (!isChief && !isAdmin) {
    el.innerHTML = UI.empty('🔒', 'Доступ запрещён', 'Только для главного врача и администраторов');
    return;
  }

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Сотрудники</h1></div>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" onclick="Pages.showAddUserModal()">+ Добавить сотрудника</button>
      </div>
    </div>

    <div class="tabs" style="margin-bottom: 16px;">
      <button class="tab-btn active" id="tabActiveBtn">
        Активные сотрудники <span class="badge badge-count" id="activeCount" style="margin-left:5px;background:var(--c-primary-bg);color:var(--c-primary)">0</span>
      </button>
      <button class="tab-btn" id="tabArchiveBtn">
        Архив сотрудников <span class="badge badge-count" id="archiveCount" style="margin-left:5px;background:var(--surface-3);color:var(--text-3)">0</span>
      </button>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div class="search-wrap" style="flex:1;min-width:240px;margin:0">
        <input type="text" id="staffSearch" class="search-input" placeholder="Поиск по имени, email, телефону..." style="padding-left:36px;width:100%;height:38px">
        <svg class="search-icon" style="top:11px;left:10px;position:absolute;color:var(--text-3)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </div>
      <select class="form-select" id="staffRoleFilter" style="width:200px;height:38px">
        <option value="">Все роли</option>
        <option value="chief_doctor">🩺 Главный врач</option>
        <option value="doctor">👨‍⚕️ Врач</option>
        <option value="admin">🗂 Администратор</option>
      </select>
    </div>

    <div class="card">
      <div class="card__body" id="usersTable">${UI.skeleton(5, 5)}</div>
    </div>
  `;

  let allUsers = [];
  let currentTab = 'active';

  const render = () => {
    const searchVal = document.getElementById('staffSearch')?.value.toLowerCase().trim() || '';
    const roleVal = document.getElementById('staffRoleFilter')?.value || '';

    const tabFiltered = allUsers.filter(u => {
      if (currentTab === 'active') return u.is_active === true;
      return u.is_active === false;
    });

    const activeCount = allUsers.filter(u => u.is_active === true).length;
    const archiveCount = allUsers.filter(u => u.is_active === false).length;
    
    const activeBadge = document.getElementById('activeCount');
    if (activeBadge) activeBadge.textContent = activeCount;
    const archiveBadge = document.getElementById('archiveCount');
    if (archiveBadge) archiveBadge.textContent = archiveCount;

    const filtered = tabFiltered.filter(u => {
      const nameMatch = `${u.last_name} ${u.first_name} ${u.middle_name || ''}`.toLowerCase().includes(searchVal);
      const emailMatch = (u.email || '').toLowerCase().includes(searchVal);
      const phoneMatch = (u.phone || '').toLowerCase().includes(searchVal);
      const roleMatch = roleVal ? u.role === roleVal : true;
      
      return (nameMatch || emailMatch || phoneMatch) && roleMatch;
    });

    const tbl = document.getElementById('usersTable');
    if (!filtered?.length) {
      tbl.innerHTML = UI.empty('👥', 'Сотрудники не найдены', 'Попробуйте изменить параметры фильтра');
      return;
    }

    tbl.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Сотрудник</th><th>Email</th><th>Роль</th><th>Телефон</th><th>Статус</th><th style="text-align:right">Действия</th>
          </tr></thead>
          <tbody>
            ${filtered.map(u => {
              const uName = `${u.last_name} ${u.first_name}`;
              return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="user-card__avatar" style="width:36px;height:36px;font-size:12px;background:var(--surface-3);color:var(--text-1);border-radius:50%;display:flex;align-items:center;justify-content:center">
                      ${UI.initials(uName)}
                    </div>
                    <div style="display:flex;flex-direction:column">
                      <span style="font-weight:600">${u.last_name} ${u.first_name} ${u.middle_name || ''}</span>
                      <span style="font-size:10px;color:var(--text-3)">Вход: ${u.last_login ? UI.fmtDateTime(u.last_login) : '—'}</span>
                    </div>
                  </div>
                </td>
                <td style="color:var(--text-2)">${u.email}</td>
                <td>${UI.badge(u.role)}</td>
                <td style="color:var(--text-3)">${u.phone || '—'}</td>
                <td>
                  <span class="badge ${u.is_active ? 'badge--confirmed' : 'badge--cancelled'}" style="display:inline-flex;align-items:center;gap:4px">
                    <span style="width:6px;height:6px;border-radius:50%;background:${u.is_active ? '#10b981' : '#6b7280'};display:inline-block"></span>
                    ${u.is_active ? 'Активен' : 'В архиве'}
                  </span>
                </td>
                <td style="text-align:right">
                   <div style="display:inline-flex;gap:6px">
                     <button class="btn-icon" title="Редактировать" onclick="Pages.showEditUserModal('${u.id}')" style="color:var(--text-2)">✏️</button>
                     
                     ${u.id !== App.user?.id ? (
                       u.is_active ? `
                         <button class="btn-icon" title="Деактивировать" onclick="Pages.deactivateUser('${u.id}', '${uName}')" style="color:var(--c-warning)">🔒</button>
                       ` : `
                         <button class="btn-icon" title="Восстановить" onclick="Pages.restoreUser('${u.id}', '${uName}')" style="color:var(--c-success)">♻️</button>
                       `
                     ) : ''}

                     ${isChief && u.id !== App.user?.id ? `
                       <button class="btn-icon" title="Удалить навсегда" onclick="Pages.deleteUserPermanent('${u.id}', '${uName}')" style="color:var(--c-danger)">🗑</button>
                     ` : ''}
                   </div>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  const setupTabs = () => {
    const tabActiveBtn = document.getElementById('tabActiveBtn');
    const tabArchiveBtn = document.getElementById('tabArchiveBtn');
    if (!tabActiveBtn || !tabArchiveBtn) return;

    tabActiveBtn.addEventListener('click', () => {
      currentTab = 'active';
      tabActiveBtn.classList.add('active');
      tabArchiveBtn.classList.remove('active');
      render();
    });

    tabArchiveBtn.addEventListener('click', () => {
      currentTab = 'archive';
      tabArchiveBtn.classList.add('active');
      tabActiveBtn.classList.remove('active');
      render();
    });
  };

  try {
    allUsers = await api.users();
    Pages._allUsers = allUsers;
    render();
    setupTabs();
    
    document.getElementById('staffSearch')?.addEventListener('input', render);
    document.getElementById('staffRoleFilter')?.addEventListener('change', render);
  } catch (e) {
    document.getElementById('usersTable').innerHTML = UI.empty('⚠️', 'Ошибка загрузки сотрудников');
  }
};

Pages.deactivateUser = async (id, name) => {
  if (!confirm(`Вы действительно хотите деактивировать сотрудника ${name}?`)) return;
  try {
    await api.deactivateUser(id);
    UI.toast('Сотрудник перемещен в архив', 'success');
    Pages.loadUsers(document.getElementById('page-users'));
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

Pages.restoreUser = async (id, name) => {
  if (!confirm(`Восстановить сотрудника ${name}?`)) return;
  try {
    await api.restoreUser(id);
    UI.toast('Сотрудник успешно восстановлен', 'success');
    Pages.loadUsers(document.getElementById('page-users'));
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

Pages.deleteUserPermanent = async (id, name) => {
  const isChief = App.user?.role === 'chief_doctor';
  if (!isChief) return;

  const warningHtml = `
    <div style="display:flex;flex-direction:column;gap:16px;padding:8px">
      <div style="color:var(--c-danger);font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px">
        ⚠️ Внимание!
      </div>
      <p style="margin:0;font-size:14px;line-height:1.5">
        Полное удаление сотрудника является необратимой операцией.
      </p>
      <div style="background:var(--surface-2);padding:12px;border-radius:8px;font-size:13px;line-height:1.6">
        <strong>Будут безвозвратно удалены:</strong>
        <ul style="margin:6px 0 0 16px;padding:0">
          <li>профиль сотрудника;</li>
          <li>настройки;</li>
          <li>права доступа;</li>
          <li>несвязанные данные.</li>
        </ul>
      </div>
      <p style="margin:0;font-weight:600">Продолжить?</p>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">
        <button class="btn-secondary" onclick="UI.closeModal()">Отмена</button>
        <button class="btn-primary" id="btnConfirmPermDelete" style="background:var(--c-danger);border-color:var(--c-danger)">Удалить навсегда</button>
      </div>
    </div>
  `;

  UI.showModal('Полное удаление сотрудника', warningHtml);

  document.getElementById('btnConfirmPermDelete')?.addEventListener('click', async () => {
    try {
      UI.closeModal();
      await api.del(`/users/${id}`);
      UI.toast('Сотрудник полностью удален', 'success');
      Pages.loadUsers(document.getElementById('page-users'));
    } catch (e) {
      let detailsHtml = '';
      
      if (e.details) {
        const d = e.details;
        const listItems = [];
        if (d.appointments) listItems.push(`• Приёмы: ${d.appointments}`);
        if (d.treatment_records) listItems.push(`• История лечения: ${d.treatment_records}`);
        if (d.payments) listItems.push(`• Финансовые операции: ${d.payments}`);
        if (d.notifications) listItems.push(`• Уведомления: ${d.notifications}`);
        if (d.patient_files) listItems.push(`• Файлы: ${d.patient_files}`);
        if (d.medical_records) listItems.push(`• Медицинские карты/записи: ${d.medical_records}`);
        if (d.schedule) listItems.push(`• Расписание: ${d.schedule}`);
        if (d.activity_log) listItems.push(`• Логи активности: ${d.activity_log}`);
        if (d.reminders) listItems.push(`• Напоминания: ${d.reminders}`);
        if (d.inventory_transactions) listItems.push(`• Операции на складе: ${d.inventory_transactions}`);
        if (d.patients) listItems.push(`• Созданные пациенты: ${d.patients}`);
        if (d.services) listItems.push(`• Измененные процедуры: ${d.services}`);
        if (d.leads) listItems.push(`• Заявки: ${d.leads}`);

        detailsHtml = `
          <div style="display:flex;flex-direction:column;gap:14px;padding:8px">
            <p style="margin:0;font-weight:600;color:var(--c-danger)">Невозможно удалить сотрудника.</p>
            <p style="margin:0;font-size:13px">Обнаружены связанные данные:</p>
            <div style="background:var(--surface-2);padding:10px 14px;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.6">
              ${listItems.join('<br>')}
            </div>
            <p style="margin:0;font-size:13px;color:var(--text-2)">
              Для удаления сначала необходимо удалить или перенести связанные данные.
            </p>
            <div style="display:flex;justify-content:flex-end;margin-top:6px">
              <button class="btn-primary" onclick="UI.closeModal()">ОК</button>
            </div>
          </div>
        `;
      } else {
        detailsHtml = `
          <div style="display:flex;flex-direction:column;gap:14px;padding:8px">
            <p style="margin:0;font-weight:600;color:var(--c-danger)">Невозможно удалить сотрудника.</p>
            <p style="margin:0;font-size:13px">${e.message}</p>
            <div style="display:flex;justify-content:flex-end;margin-top:6px">
              <button class="btn-primary" onclick="UI.closeModal()">ОК</button>
            </div>
          </div>
        `;
      }

      UI.showModal('Ошибка удаления', detailsHtml);
    }
  });
};

Pages.showEditUserModal = (id) => {
  const u = Pages._allUsers?.find(x => x.id === id);
  if (!u) {
    UI.toast('Сотрудник не найден', 'error');
    return;
  }

  UI.showModal('Редактировать сотрудника', `
    <form id="editUserForm" style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Фамилия *</label>
          <input class="form-input" name="last_name" value="${u.last_name}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Имя *</label>
          <input class="form-input" name="first_name" value="${u.first_name}" required />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input class="form-input" type="email" name="email" value="${u.email}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Пароль</label>
        <input class="form-input" type="password" name="password" placeholder="Оставьте пустым для сохранения текущего" minlength="6" />
      </div>
      <div class="form-group">
        <label class="form-label">Роль *</label>
        <select class="form-select" name="role_id" required>
          <option value="2" ${u.role === 'doctor' ? 'selected' : ''}>Врач</option>
          <option value="3" ${u.role === 'admin' ? 'selected' : ''}>Администратор</option>
          <option value="1" ${u.role === 'chief_doctor' ? 'selected' : ''}>Главный врач</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Телефон</label>
        <input class="form-input" name="phone" type="tel" value="${u.phone || ''}" placeholder="+996 XXX XXX XXX" />
      </div>
      <button type="submit" class="btn-primary">Сохранить изменения</button>
    </form>
  `);

  document.getElementById('editUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    try {
      await api.updateUser(id, body);
      UI.closeModal();
      UI.toast('Данные сотрудника обновлены', 'success');
      Pages.loadUsers(document.getElementById('page-users'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
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