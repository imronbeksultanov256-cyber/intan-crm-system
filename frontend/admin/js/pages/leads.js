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
  // Загружаем данные заявки
  try {
    const leads = await api.leads();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Открываем модалку создания записи, предзаполнив данные
    // Но сначала нужно найти или создать пациента
    UI.showModal('Оформление заявки', `
      <div style="margin-bottom:16px">
        <p>Клиент: <b>${lead.name}</b></p>
        <p>Телефон: <b>${lead.phone}</b></p>
      </div>
      <button class="btn-primary btn-block" onclick="Pages._processLeadStep2('${leadId}')">Продолжить оформление</button>
    `);
  } catch (e) { UI.toast(e.message, 'error'); }
};

Pages._processLeadStep2 = async (leadId) => {
  const leads = await api.leads();
  const lead = leads.find(l => l.id === leadId);
  
  // 1. Пытаемся найти пациента по телефону
  let patientId = null;
  try {
    const res = await api.patients(`?search=${encodeURIComponent(lead.phone)}&limit=1`);
    if (res?.data?.[0]) patientId = res.data[0].id;
  } catch(_) {}

  UI.closeModal();
  
  // Открываем стандартную модалку создания записи
  await Pages.showCreateApptModal(patientId);
  
  // Предзаполняем поля если пациент новый
  if (!patientId) {
    const nameParts = lead.name.split(' ');
    document.getElementById('apptPhone').value = lead.phone;
    document.getElementById('apptLastName').value = nameParts[0] || '';
    document.getElementById('apptFirstName').value = nameParts[1] || '';
    
    // Показываем поля ФИО
    document.getElementById('newPatientFields').style.display = 'grid';
  }

  // Предзаполняем врача и услугу
  if (lead.doctor_id) document.getElementById('apptDoctor').value = lead.doctor_id;
  if (lead.service_id) document.getElementById('apptService').value = lead.service_id;
  if (lead.comment) document.getElementById('apptComment').value = lead.comment;

  // После успешного создания записи в createApptForm, нам нужно будет пометить лид как обработанный.
  // Для этого мы подменим обработчик формы или добавим колбэк.
  // Упростим: просто добавим кнопку "Пометить как обработанную" в таблицу или сделаем это автоматически.
  
  // Чтобы сделать это автоматически, нам нужно знать, когда createApptForm отправится.
  const originalForm = document.getElementById('createApptForm');
  originalForm.addEventListener('submit', async () => {
     // Ждем немного и помечаем лид
     setTimeout(async () => {
        try { await api.updateLeadStatus(leadId, 'processed'); } catch(_) {}
     }, 1000);
  });
};
