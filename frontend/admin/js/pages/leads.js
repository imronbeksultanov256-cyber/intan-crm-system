// ── LEADS PAGE ───────────────────────────────────────────

Pages.loadLeads = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <div><h1>Заявки с сайта</h1></div>
      <button class="btn-ghost" onclick="Pages._leadsLoad()">🔄 Обновить</button>
    </div>

    <div class="card">
      <div class="card__body" id="leadsTable">${UI.skeleton(6, 6)}</div>
    </div>
  `;

  await Pages._leadsLoad();
};

Pages._leadsLoad = async () => {
  const tbl = document.getElementById('leadsTable');
  try {
    const leads = await api.leads();
    Pages._renderLeads(leads || []);
  } catch (e) {
    if (tbl) tbl.innerHTML = UI.empty('⚠️', 'Ошибка загрузки', e.message);
  }
};

Pages._renderLeads = (rows) => {
  const tbl = document.getElementById('leadsTable');
  if (!tbl) return;

  if (!rows.length) {
    tbl.innerHTML = UI.empty('🔔', 'Нет новых заявок', 'Все заявки обработаны');
    return;
  }

  tbl.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Дата</th>
          <th>Клиент</th>
          <th>Контакты</th>
          <th>Пожелания</th>
          <th>Статус</th>
          <th style="text-align:right">Действия</th>
        </tr></thead>
        <tbody>
          ${rows.map(l => {
            const date = new Date(l.created_at).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
            const pref = l.preferred_dt ? new Date(l.preferred_dt).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : 'Не указано';
            
            return `
              <tr style="${l.status === 'new' ? 'background:var(--c-primary-bg)' : ''}">
                <td>
                   <div style="font-size:13px;font-weight:600">${date}</div>
                </td>
                <td>
                  <div style="font-weight:700">${l.name}</div>
                  <div style="font-size:11px;color:var(--text-3)">ID: ${l.id.slice(0,8)}</div>
                </td>
                <td>
                  <div style="font-weight:600">${l.phone}</div>
                  <div style="font-size:12px;color:var(--text-3)">${l.email || ''}</div>
                </td>
                <td>
                  <div style="font-size:12px"><b>Врач:</b> ${l.doctor_name || 'Любой'}</div>
                  <div style="font-size:12px"><b>Услуга:</b> ${l.service_name || 'Не выбрана'}</div>
                  <div style="font-size:12px"><b>Время:</b> ${pref}</div>
                </td>
                <td>${UI.badge(l.status)}</td>
                <td>
                  <div class="actions">
                    ${l.status === 'new' ? `
                      <button class="btn-primary btn-sm" onclick="Pages.convertLeadToPatient('${l.id}')">Оформить</button>
                      <button class="btn-secondary btn-sm" onclick="Pages.cancelLead('${l.id}')">Отклонить</button>
                    ` : `
                      <button class="btn-icon" onclick="Pages.deleteLead('${l.id}')">🗑️</button>
                    `}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
};

Pages.cancelLead = async (id) => {
  if (!confirm('Отклонить заявку?')) return;
  try {
    await api.updateLeadStatus(id, 'cancelled');
    UI.toast('Заявка отклонена');
    Pages._leadsLoad();
  } catch (e) { UI.toast(e.message, 'error'); }
};

Pages.deleteLead = async (id) => {
  if (!confirm('Удалить запись о заявке навсегда?')) return;
  try {
    await api.deleteLead(id);
    UI.toast('Заявка удалена');
    Pages._leadsLoad();
  } catch (e) { UI.toast(e.message, 'error'); }
};

Pages.convertLeadToPatient = async (leadId) => {
  try {
    const leads = await api.leads();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Пытаемся найти пациента по телефону
    let existingPatient = null;
    try {
      const res = await api.patients(`?search=${encodeURIComponent(lead.phone)}&limit=1`);
      if (res?.data?.[0]) existingPatient = res.data[0];
    } catch(_) {}

    const nameParts = lead.name.trim().split(' ');
    const lastName  = nameParts[0] || '';
    const firstName = nameParts[1] || '';
    const middleName = nameParts[2] || '';

    // Загружаем врачей и услуги для формы
    const [doctors, svcsRes] = await Promise.all([
      api.doctors().catch(() => []),
      api.services().catch(() => ({ grouped: [] }))
    ]);
    const services = (svcsRes.grouped || []).flatMap(g => g.services || []);

    const pref = lead.preferred_dt
      ? new Date(lead.preferred_dt).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : 'Не указано';

    UI.showModal('Оформление заявки', `
      <div style="background:var(--surface-2);border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;display:flex;flex-direction:column;gap:4px">
        <div><b>Клиент:</b> ${lead.name}</div>
        <div><b>Телефон:</b> ${lead.phone}</div>
        ${lead.email ? `<div><b>Email:</b> ${lead.email}</div>` : ''}
        <div><b>Желаемое время:</b> ${pref}</div>
        ${lead.comment ? `<div><b>Комментарий:</b> ${lead.comment}</div>` : ''}
        ${existingPatient
          ? `<div style="color:var(--c-accent);font-weight:600;margin-top:4px">✓ Пациент найден в базе: ${existingPatient.last_name} ${existingPatient.first_name}</div>`
          : `<div style="color:var(--c-warning);font-weight:600;margin-top:4px">⚠ Новый пациент — будет создан автоматически</div>`
        }
      </div>

      <form id="leadConvertForm" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">Врач *</label>
            <select class="form-select" id="lcDoctor" required>
              <option value="">Выберите врача</option>
              ${doctors.map(d => `<option value="${d.id}" ${lead.doctor_id === d.id ? 'selected' : ''}>${d.last_name} ${d.first_name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Услуга</label>
            <select class="form-select" id="lcService">
              <option value="">Не выбрана</option>
              ${services.map(s => `<option value="${s.id}" ${lead.service_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">Дата *</label>
            <input class="form-input" type="date" id="lcDate" value="${lead.preferred_dt ? lead.preferred_dt.slice(0,10) : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Время *</label>
            <input class="form-input" type="time" id="lcTime" value="${lead.preferred_dt ? lead.preferred_dt.slice(11,16) : ''}" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Комментарий</label>
          <textarea class="form-textarea" id="lcComment" rows="2">${lead.comment || ''}</textarea>
        </div>
        <button type="submit" class="btn-primary">✓ Создать запись и оформить</button>
      </form>
    `);

    document.getElementById('leadConvertForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const doctorId  = document.getElementById('lcDoctor').value;
      const serviceId = document.getElementById('lcService').value;
      const date      = document.getElementById('lcDate').value;
      const time      = document.getElementById('lcTime').value;
      const comment   = document.getElementById('lcComment').value;

      if (!doctorId || !date || !time) {
        UI.toast('Выберите врача, дату и время', 'error'); return;
      }

      const apptDt = `${date}T${time}:00`;
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Сохранение...';

      try {
        // 1. Создаём пациента если не найден
        let patientId = existingPatient?.id;
        if (!patientId) {
          const newPat = await api.createPatient({
            last_name:   lastName,
            first_name:  firstName || 'Пациент',
            middle_name: middleName || null,
            phone:       lead.phone,
            email:       lead.email || null,
            source:      'online'
          });
          patientId = newPat.id;
        }

        // 2. Создаём запись
        await api.createAppt({
          patient_id:     patientId,
          doctor_id:      doctorId,
          service_id:     serviceId || null,
          appointment_dt: apptDt,
          comment:        comment || null,
          source:         'online'
        });

        // 3. Помечаем заявку как обработанную
        await api.updateLeadStatus(leadId, 'processed');

        UI.closeModal();
        UI.toast('Запись создана, заявка оформлена', 'success');
        await Pages._leadsLoad();
      } catch (err) {
        btn.disabled = false; btn.textContent = '✓ Создать запись и оформить';
        UI.toast(err.message || 'Ошибка при оформлении', 'error');
      }
    });
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};
