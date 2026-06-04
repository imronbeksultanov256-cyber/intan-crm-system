Pages.loadAppointments = async (el) => {
  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Записи на приём</h1></div>
      <button class="btn-primary" onclick="Pages.showCreateApptModal()">+ Новая запись</button>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
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
    </div>
    <div class="card">
      <div class="card__body" id="apptTable">${UI.skeleton(6,6)}</div>
    </div>
  `;

  const load = async () => {
    const date   = document.getElementById('apptDateFilter').value;
    const status = document.getElementById('apptStatusFilter').value;
    const params = `?${date ? `date=${date}&` : ''}${status ? `status=${status}` : ''}`;

    try {
      const rows = await api.appointments(params);
      renderAppointments(rows);
    } catch (e) {
      document.getElementById('apptTable').innerHTML = UI.empty('⚠️','Ошибка загрузки');
    }
  };

  document.getElementById('apptDateFilter').addEventListener('change', load);
  document.getElementById('apptStatusFilter').addEventListener('change', load);
  await load();
};

function renderAppointments(rows) {
  const tbl = document.getElementById('apptTable');
  if (!rows?.length) {
    tbl.innerHTML = UI.empty('📅','Нет записей','Измените фильтры или создайте новую запись');
    return;
  }

  tbl.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Время</th><th>Пациент</th><th>Врач</th><th>Услуга</th><th>Статус</th><th style="text-align:right">Действия</th>
        </tr></thead>
        <tbody>
          ${rows.map(a => `
            <tr>
              <td>
                <div style="font-family:var(--font-mono);font-weight:600;font-size:13px">
                  ${new Date(a.appointment_dt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
                </div>
                <div style="font-size:11px;color:var(--text-3)">
                  ${new Date(a.appointment_dt).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}
                </div>
              </td>
              <td>
                <div style="font-weight:500">${a.patient_name}</div>
                <div style="font-size:12px;color:var(--text-3)">${a.patient_phone || ''}</div>
              </td>
              <td>
                <div>${a.doctor_name}</div>
                <div style="font-size:12px;color:var(--text-3)">${a.specialization || ''}</div>
              </td>
              <td style="color:var(--text-2)">${a.service_name || '—'}</td>
              <td>${UI.badge(a.status)}</td>
              <td>
                <div class="actions">
                  ${a.status === 'pending' ? `<button class="btn-icon" title="Подтвердить" onclick="Pages.changeApptStatus('${a.id}','confirmed')">✓</button>` : ''}
                  ${a.status === 'confirmed' ? `<button class="btn-icon" title="Начать приём" onclick="Pages.changeApptStatus('${a.id}','in_progress')" style="color:var(--c-accent)">▶</button>` : ''}
                  ${a.status === 'in_progress' ? `<button class="btn-icon" title="Завершить" onclick="Pages.changeApptStatus('${a.id}','completed')" style="color:var(--c-primary)">✔✔</button>` : ''}
                  ${['pending','confirmed'].includes(a.status) ? `<button class="btn-icon" title="Отменить" onclick="Pages.changeApptStatus('${a.id}','cancelled')" style="color:var(--c-danger)">✕</button>` : ''}
                  <button class="btn-icon" title="Открыть пациента" onclick="navigate('patient-detail',{patientId:'${a.patient_id}'})">👤</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

Pages.changeApptStatus = async (id, status) => {
  try {
    await api.updateApptStatus(id, status);
    UI.toast(`Статус обновлён: ${status}`, 'success');
    Pages.loadAppointments(document.getElementById('page-appointments'));
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

Pages.showCreateApptModal = async () => {
  let doctors = [], services = [];
  try {
    [doctors, services] = await Promise.all([api.doctors(), api.services()]);
    if (services?.flat) services = services.flat || services;
    if (services?.flat) services = services.flat;
  } catch (_) {}

  const svcFlat = Array.isArray(services) ? services : (services?.flat || []);

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
          ${(doctors || []).map(d => `<option value="${d.id}">${d.last_name} ${d.first_name} — ${d.specialization}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Дата *</label>
          <input class="form-input" type="date" id="apptDate" min="${new Date().toISOString().split('T')[0]}" onchange="Pages.loadApptSlots()" />
        </div>
        <div class="form-group">
          <label class="form-label">Время *</label>
          <select class="form-select" id="apptTime">
            <option value="">Сначала выберите врача и дату</option>
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
    const patientId   = document.getElementById('apptPatientId').value;
    const phone       = document.getElementById('apptPhone').value;
    const lastName    = document.getElementById('apptLastName').value;
    const firstName   = document.getElementById('apptFirstName').value;
    const doctorId    = document.getElementById('apptDoctor').value;
    const date        = document.getElementById('apptDate').value;
    const time        = document.getElementById('apptTime').value;
    const serviceId   = document.getElementById('apptService').value;
    const comment     = document.getElementById('apptComment').value;

    if (!doctorId || !date || !time) {
      UI.toast('Выберите врача, дату и время', 'error'); return;
    }

    const apptDt = `${date}T${time}:00`;

    try {
      // If no existing patient found, create via /book endpoint
      if (!patientId) {
        if (!phone || !lastName) { UI.toast('Укажите телефон и ФИО пациента', 'error'); return; }
        await api.post('/book', {
          patient_name: `${lastName} ${firstName}`,
          phone, doctor_id: doctorId,
          service_id: serviceId || null,
          appointment_dt: apptDt, comment
        });
      } else {
        await api.createAppt({
          patient_id: patientId, doctor_id: doctorId,
          service_id: serviceId || null,
          appointment_dt: apptDt, comment,
          source: 'admin'
        });
      }
      UI.closeModal();
      UI.toast('Запись создана', 'success');
      Pages.loadAppointments(document.getElementById('page-appointments'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.lookupPatient = async () => {
  const phone = document.getElementById('apptPhone').value.replace(/\s/g,'');
  if (!phone) return;
  try {
    const res = await api.patients(`?search=${encodeURIComponent(phone)}&limit=1`);
    const p = res?.data?.[0];
    if (p) {
      document.getElementById('apptPatientId').value = p.id;
      document.getElementById('patientFound').textContent = `✓ Найден: ${p.last_name} ${p.first_name}`;
      document.getElementById('newPatientFields').style.display = 'none';
    } else {
      document.getElementById('patientFound').textContent = 'Новый пациент — заполните ФИО';
      document.getElementById('patientFound').style.color = 'var(--c-warning)';
      document.getElementById('newPatientFields').style.display = 'grid';
    }
  } catch (_) {}
};

Pages.loadApptSlots = async () => {
  const doctorId = document.getElementById('apptDoctor').value;
  const date     = document.getElementById('apptDate').value;
  const timeEl   = document.getElementById('apptTime');
  if (!doctorId || !date) return;

  timeEl.innerHTML = '<option>Загрузка...</option>';
  try {
    const res = await api.slots(doctorId, date);
    const slots = res?.slots || [];
    if (!slots.length) {
      timeEl.innerHTML = '<option>Нет свободных слотов</option>';
    } else {
      timeEl.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
    }
  } catch (_) {
    timeEl.innerHTML = '<option>Ошибка загрузки</option>';
  }
};
