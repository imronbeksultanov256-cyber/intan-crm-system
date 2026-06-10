// ── APPOINTMENTS PAGE ──────────────────────────────────────

Pages.loadAppointments = async (el) => {
  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Записи на приём</h1></div>
      <button class="btn-primary" onclick="Pages.showCreateApptModal()">+ Новая запись</button>
    </div>

    <!-- Счётчики статусов -->
    <div id="apptCounters" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${['pending','confirmed','in_progress','completed','cancelled'].map(s => `
        <div class="appt-counter" data-status="${s}" onclick="Pages.filterByStatus('${s}')" style="
          background:var(--surface);border:1px solid var(--border);border-radius:10px;
          padding:10px 16px;cursor:pointer;transition:all 0.18s;min-width:110px;text-align:center;
        ">
          <div class="appt-counter__num" id="cnt-${s}" style="font-size:1.4rem;font-weight:700">—</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px">${{
            pending:'Ожидают', confirmed:'Подтверждены',
            in_progress:'На приёме', completed:'Завершены', cancelled:'Отменены'
          }[s]}</div>
        </div>
      `).join('')}
    </div>

    <!-- Мини-календарь недели -->
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-weight:600;font-size:14px">Неделя</span>
        <div style="display:flex;gap:6px">
          <button class="btn-ghost btn-sm" id="weekPrev">←</button>
          <button class="btn-ghost btn-sm" id="weekToday">Сегодня</button>
          <button class="btn-ghost btn-sm" id="weekNext">→</button>
        </div>
      </div>
      <div id="weekCalendar" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px"></div>
    </div>

    <!-- Фильтры -->
    <div class="toolbar" style="margin-bottom:12px">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="search-input" id="apptDateFilter" type="date" value="${today}" style="padding-left:12px" />
      </div>
      <select class="form-select" id="apptStatusFilter" style="width:180px">
        <option value="">Все статусы</option>
        <option value="pending">Ожидает</option>
        <option value="confirmed">Подтверждено</option>
        <option value="in_progress">Приём</option>
        <option value="completed">Завершено</option>
        <option value="cancelled">Отменено</option>
        <option value="no_show">Не пришёл</option>
      </select>
      <button class="btn-secondary btn-sm" onclick="Pages._apptShowAll()">📅 Все записи</button>
      <button class="btn-ghost btn-sm" onclick="Pages._apptLoad()">🔄 Обновить</button>
    </div>

    <!-- Таблица -->
    <div class="card">
      <div class="card__body" id="apptTable">${UI.skeleton(6, 6)}</div>
    </div>
  `;

  // Инициализируем неделю
  Pages._apptWeekOffset = 0;
  Pages._apptSelectedDate = today;
  Pages._renderWeek();

  // Слушатели
  document.getElementById('apptDateFilter').addEventListener('change', (e) => {
    Pages._apptSelectedDate = e.target.value;
    Pages._apptLoad();
  });
  document.getElementById('apptStatusFilter').addEventListener('change', Pages._apptLoad);
  document.getElementById('weekPrev').addEventListener('click', () => {
    Pages._apptWeekOffset--;
    Pages._renderWeek();
  });
  document.getElementById('weekNext').addEventListener('click', () => {
    Pages._apptWeekOffset++;
    Pages._renderWeek();
  });
  document.getElementById('weekToday').addEventListener('click', () => {
    Pages._apptWeekOffset = 0;
    Pages._apptSelectedDate = new Date().toISOString().split('T')[0];
    document.getElementById('apptDateFilter').value = Pages._apptSelectedDate;
    Pages._renderWeek();
    Pages._apptLoad();
  });

  // Загружаем данные
  await Pages._apptLoad();
  await Pages._loadCounters();
};

// ── Рендер мини-календаря недели ──────────────────────────
Pages._renderWeek = () => {
  const cal = document.getElementById('weekCalendar');
  if (!cal) return;

  const now = new Date();
  now.setDate(now.getDate() + Pages._apptWeekOffset * 7);

  // Начало недели (пн)
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);

  const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const today = new Date().toISOString().split('T')[0];

  cal.innerHTML = Array.from({length: 7}, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const isToday    = iso === today;
    const isSelected = iso === Pages._apptSelectedDate;
    const isWeekend  = i >= 5;

    return `
      <div onclick="Pages._selectDay('${iso}')" style="
        text-align:center;padding:8px 4px;border-radius:8px;cursor:pointer;
        background:${isSelected ? 'var(--c-primary)' : isToday ? 'var(--c-primary-bg)' : 'var(--surface-2)'};
        color:${isSelected ? '#fff' : isWeekend ? 'var(--c-danger)' : 'var(--text)'};
        border:1px solid ${isSelected ? 'var(--c-primary)' : 'var(--border)'};
        transition:all 0.15s;
      ">
        <div style="font-size:10px;font-weight:600;opacity:0.7">${dayNames[i]}</div>
        <div style="font-size:16px;font-weight:700;margin-top:2px">${d.getDate()}</div>
        <div id="dot-${iso}" style="height:4px;margin-top:4px"></div>
      </div>
    `;
  }).join('');
};

// ── Выбор дня в календаре ─────────────────────────────────
Pages._selectDay = (iso) => {
  Pages._apptSelectedDate = iso;
  document.getElementById('apptDateFilter').value = iso;
  Pages._renderWeek();
  Pages._apptLoad();
};

Pages._apptShowAll = () => {
  document.getElementById('apptDateFilter').value = '';
  Pages._apptSelectedDate = '';
  Pages._renderWeek();
  Pages._apptLoad();
};

// ── Фильтр по статусу через счётчик ──────────────────────
Pages.filterByStatus = (status) => {
  const sel = document.getElementById('apptStatusFilter');
  if (sel) {
    sel.value = sel.value === status ? '' : status;
    Pages._apptLoad();
  }
};

// ── Загрузка записей ──────────────────────────────────────
Pages._apptLoad = async () => {
  const date   = document.getElementById('apptDateFilter')?.value || '';
  const status = document.getElementById('apptStatusFilter')?.value || '';
  let params = '?';
  if (date)   params += `date=${date}&`;
  if (status) params += `status=${status}`;

  try {
    const rows = await api.appointments(params);
    Pages._renderAppointments(rows || []);
  } catch (e) {
    const tbl = document.getElementById('apptTable');
    if (tbl) tbl.innerHTML = UI.empty('⚠️', 'Ошибка загрузки', e.message);
  }
};

// ── Счётчики по статусам ──────────────────────────────────
Pages._loadCounters = async () => {
  try {
    const all = await api.appointments('?');
    if (!all?.length) return;

    const counts = { pending:0, confirmed:0, in_progress:0, completed:0, cancelled:0 };
    all.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

    Object.entries(counts).forEach(([status, count]) => {
      const el = document.getElementById(`cnt-${status}`);
      if (el) el.textContent = count;

      // Подсвечиваем счётчик если есть записи
      const card = document.querySelector(`.appt-counter[data-status="${status}"]`);
      if (card && count > 0 && status === 'pending') {
        card.style.borderColor = 'var(--c-warning)';
        card.style.background  = '#fefce8';
      }
    });
  } catch (_) {}
};

// ── Рендер таблицы записей ────────────────────────────────
Pages._renderAppointments = (rows) => {
  const tbl = document.getElementById('apptTable');
  if (!tbl) return;

  if (!rows.length) {
    tbl.innerHTML = UI.empty('📅', 'Нет записей на выбранную дату', 'Создайте новую запись или выберите другую дату');
    return;
  }

  const statusFlow = {
    pending:     { next: 'confirmed',   label: '✓ Подтвердить',  color: 'var(--c-accent)' },
    confirmed:   { next: 'in_progress', label: '▶ Начать приём', color: 'var(--c-primary)' },
    in_progress: { next: 'completed',   label: '✔ Завершить',    color: 'var(--c-purple)' },
  };

  tbl.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Время</th>
          <th>Пациент</th>
          <th>Врач</th>
          <th>Услуга</th>
          <th>Статус</th>
          <th style="text-align:right">Действия</th>
        </tr></thead>
        <tbody>
          ${rows.map(a => {
            const time = new Date(a.appointment_dt).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
            const date = new Date(a.appointment_dt).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit'});
            const flow = statusFlow[a.status];
            const canCancel = ['pending','confirmed'].includes(a.status);

            return `
              <tr style="transition:background 0.15s">
                <td>
                  <div style="font-family:var(--font-mono);font-weight:700;font-size:14px">${time}</div>
                  <div style="font-size:11px;color:var(--text-3)">${date}</div>
                </td>
                <td>
                  <div style="font-weight:600">${a.patient_name || '—'}</div>
                  <div style="font-size:12px;color:var(--text-3)">${a.patient_phone || ''}</div>
                </td>
                <td>
                  <div style="font-weight:500">${a.doctor_name || '—'}</div>
                  <div style="font-size:12px;color:var(--text-3)">${a.specialization || ''}</div>
                </td>
                <td style="color:var(--text-2);font-size:13px">${a.service_name || '—'}</td>
                <td>${UI.badge(a.status)}</td>
                <td>
                  <div class="actions">
                    ${flow ? `
                      <button class="btn-icon" title="${flow.label}"
                        style="color:${flow.color};border-color:${flow.color}"
                        onclick="Pages.changeApptStatus('${a.id}','${flow.next}')">
                        ${flow.label.split(' ')[0]}
                      </button>
                    ` : ''}
                    ${canCancel ? `
                      <button class="btn-icon" title="Отменить"
                        style="color:var(--c-danger)"
                        onclick="Pages.changeApptStatus('${a.id}','cancelled')">✕</button>
                    ` : ''}
                    ${a.status === 'pending' ? `
                      <button class="btn-icon" title="Не пришёл"
                        style="color:var(--text-3)"
                        onclick="Pages.changeApptStatus('${a.id}','no_show')">👻</button>
                    ` : ''}
                    <button class="btn-icon" title="Карточка пациента"
                      onclick="window.navigate('patient-detail', {patientId: '${a.patient_id}'})">👤</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="padding:12px 16px;font-size:12px;color:var(--text-3);border-top:1px solid var(--border)">
      Всего записей: <strong>${rows.length}</strong>
    </div>
  `;
};

// ── Изменение статуса ─────────────────────────────────────
Pages.changeApptStatus = async (id, status) => {
  const labels = {
    confirmed:   'Подтверждено',
    in_progress: 'Приём начат',
    completed:   'Завершено',
    cancelled:   'Отменено',
    no_show:     'Отмечен как не пришедший',
  };
  try {
    await api.updateApptStatus(id, status);
    UI.toast(labels[status] || 'Статус обновлён', 'success');
    await Pages._apptLoad();
    await Pages._loadCounters();
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

// ── Создание новой записи ─────────────────────────────────
Pages.showCreateApptModal = async () => {
  let doctors = [], svcFlat = [];
  try {
    const [d, s] = await Promise.all([api.doctors(), api.services()]);
    doctors = d || [];
    svcFlat = s?.flat || (Array.isArray(s) ? s : []);
  } catch (_) {}

  UI.showModal('Новая запись на приём', `
    <form id="createApptForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label class="form-label">Телефон пациента *</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="apptPhone" placeholder="+996 XXX XXX XXX" style="flex:1" />
          <button type="button" class="btn-secondary" onclick="Pages.lookupPatient()">Найти</button>
        </div>
        <div id="patientFound" style="font-size:12px;color:var(--c-accent);margin-top:4px"></div>
      </div>
      <input type="hidden" id="apptPatientId" />
      <div id="newPatientFields" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Фамилия *</label>
          <input class="form-input" id="apptLastName" />
        </div>
        <div class="form-group">
          <label class="form-label">Имя *</label>
          <input class="form-input" id="apptFirstName" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Врач *</label>
        <select class="form-select" id="apptDoctor" onchange="Pages.loadApptSlots()">
          <option value="">Выберите врача</option>
          ${doctors.map(d => `
            <option value="${d.id}">${d.last_name} ${d.first_name} — ${d.specialization}</option>
          `).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Дата *</label>
          <input class="form-input" type="date" id="apptDate"
            min="${new Date().toISOString().split('T')[0]}"
            value="${Pages._apptSelectedDate || ''}"
            onchange="Pages.loadApptSlots()" />
        </div>
        <div class="form-group">
          <label class="form-label">Время *</label>
          <select class="form-select" id="apptTime">
            <option value="">Выберите врача и дату</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Услуга</label>
        <select class="form-select" id="apptService">
          <option value="">Не выбрана</option>
          ${svcFlat.map(s => `<option value="${s.id}">${s.name} — ${s.price} сом</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Комментарий</label>
        <textarea class="form-textarea" id="apptComment" rows="2"></textarea>
      </div>
      <button type="submit" class="btn-primary">Создать запись</button>
    </form>
  `);

  document.getElementById('createApptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = document.getElementById('apptPatientId').value;
    const phone     = document.getElementById('apptPhone').value;
    const lastName  = document.getElementById('apptLastName').value;
    const firstName = document.getElementById('apptFirstName').value;
    const doctorId  = document.getElementById('apptDoctor').value;
    const date      = document.getElementById('apptDate').value;
    const time      = document.getElementById('apptTime').value;
    const serviceId = document.getElementById('apptService').value;
    const comment   = document.getElementById('apptComment').value;

    if (!doctorId || !date || !time) {
      UI.toast('Выберите врача, дату и время', 'error'); return;
    }

    const apptDt = `${date}T${time}:00`;

    try {
      if (!patientId) {
        if (!phone || !lastName) { UI.toast('Укажите телефон и ФИО', 'error'); return; }
        await api.post('/book', {
          patient_name: `${lastName} ${firstName}`,
          phone, doctor_id: doctorId,
          service_id: serviceId || null,
          appointment_dt: apptDt, comment,
        });
      } else {
        await api.createAppt({
          patient_id: patientId, doctor_id: doctorId,
          service_id: serviceId || null,
          appointment_dt: apptDt, comment, source: 'admin',
        });
      }
      UI.closeModal();
      UI.toast('Запись создана', 'success');
      await Pages._apptLoad();
      await Pages._loadCounters();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

// ── Поиск пациента по телефону ────────────────────────────
Pages.lookupPatient = async () => {
  const phone = document.getElementById('apptPhone').value.replace(/\s/g, '');
  if (!phone) return;
  try {
    const res = await api.patients(`?search=${encodeURIComponent(phone)}&limit=1`);
    const p = res?.data?.[0];
    const foundEl  = document.getElementById('patientFound');
    const fieldsEl = document.getElementById('newPatientFields');
    if (p) {
      document.getElementById('apptPatientId').value = p.id;
      foundEl.style.color   = 'var(--c-accent)';
      foundEl.textContent   = `✓ Найден: ${p.last_name} ${p.first_name}`;
      fieldsEl.style.display = 'none';
    } else {
      foundEl.style.color   = 'var(--c-warning)';
      foundEl.textContent   = 'Новый пациент — заполните ФИО';
      fieldsEl.style.display = 'grid';
    }
  } catch (_) {}
};

// ── Загрузка свободных слотов ─────────────────────────────
Pages.loadApptSlots = async () => {
  const doctorId = document.getElementById('apptDoctor')?.value;
  const date     = document.getElementById('apptDate')?.value;
  const timeEl   = document.getElementById('apptTime');
  if (!doctorId || !date || !timeEl) return;

  timeEl.innerHTML = '<option>Загрузка слотов...</option>';
  try {
    const res   = await api.slots(doctorId, date);
    const slots = res?.slots || [];
    timeEl.innerHTML = slots.length
      ? slots.map(s => `<option value="${s}">${s}</option>`).join('')
      : '<option value="">Нет свободных слотов</option>';
  } catch (_) {
    timeEl.innerHTML = '<option value="">Ошибка загрузки</option>';
  }
};