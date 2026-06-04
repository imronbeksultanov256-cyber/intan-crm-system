Pages.loadPatients = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <div><h1>База пациентов</h1></div>
      <button class="btn-primary" onclick="Pages.showCreatePatientModal()">+ Новый пациент</button>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="patientSearch" placeholder="Поиск по ФИО или телефону..." />
      </div>
      <select class="form-select" id="patientSort" style="width:160px">
        <option value="created_at">По дате</option>
        <option value="last_name">По имени</option>
      </select>
    </div>
    <div id="patientsList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${[1,2,3,4,5,6].map(()=>`<div class="card" style="height:100px"></div>`).join('')}
    </div>
    <div id="patientsPagination" class="pagination"></div>
  `;

  let page = 1;
  const limit = 18;

  const load = async () => {
    const search = document.getElementById('patientSearch')?.value || '';
    const sortBy = document.getElementById('patientSort')?.value || 'created_at';
    try {
      const res = await api.patients(`?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}&sortBy=${sortBy}`);
      renderPatients(res.data, res.total, res.page, res.limit);
    } catch (e) {
      document.getElementById('patientsList').innerHTML = UI.empty('⚠️','Ошибка загрузки');
    }
  };

  const debouncedSearch = UI.debounce(load, 350);
  document.getElementById('patientSearch').addEventListener('input', () => { page = 1; debouncedSearch(); });
  document.getElementById('patientSort').addEventListener('change', () => { page = 1; load(); });

  await load();

  function renderPatients(patients, total, curPage, lim) {
    const list = document.getElementById('patientsList');
    if (!patients?.length) {
      list.innerHTML = UI.empty('👥','Пациенты не найдены','Попробуйте другой запрос или создайте нового пациента');
      return;
    }

    list.innerHTML = patients.map(p => {
      const initials = UI.initials(`${p.last_name} ${p.first_name}`);
      const age = p.date_of_birth
        ? Math.floor((Date.now() - new Date(p.date_of_birth)) / (1000*60*60*24*365))
        : null;
      return `
        <div class="patient-card" onclick="navigate('patient-detail',{patientId:'${p.id}'})">
          <div class="patient-card__avatar">${initials}</div>
          <div style="flex:1;min-width:0">
            <div class="patient-card__name">${p.last_name} ${p.first_name} ${p.middle_name||''}</div>
            <div class="patient-card__meta">
              ${age ? `${age} лет · ` : ''}${p.phone}
            </div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--text-3)">
                ${p.visit_count || 0} визит${p.visit_count == 1 ? '' : p.visit_count > 4 ? 'ов' : 'а'}
              </span>
              <span style="font-size:11px;color:var(--text-3)">· ${UI.fmtDate(p.created_at)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Pagination
    const pages = Math.ceil(total / lim);
    const pag = document.getElementById('patientsPagination');
    if (pages <= 1) { pag.innerHTML = ''; return; }

    pag.innerHTML = `
      <button class="page-btn" ${curPage === 1 ? 'disabled' : ''} onclick="Pages._patientsGoPage(${curPage-1})">←</button>
      ${Array.from({length: Math.min(pages, 5)}, (_,i) => {
        const pg = curPage <= 3 ? i+1 : curPage - 2 + i;
        if (pg < 1 || pg > pages) return '';
        return `<button class="page-btn ${pg===curPage?'active':''}" onclick="Pages._patientsGoPage(${pg})">${pg}</button>`;
      }).join('')}
      <button class="page-btn" ${curPage === pages ? 'disabled' : ''} onclick="Pages._patientsGoPage(${curPage+1})">→</button>
      <span style="font-size:12px;color:var(--text-3);margin-left:8px">Всего: ${total}</span>
    `;
  }

  Pages._patientsGoPage = (pg) => {
    page = pg;
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
};

Pages.loadPatientDetail = async (el, params) => {
  const id = params?.patientId || currentPatientId;
  if (!id) { el.innerHTML = UI.empty('⚠️','ID пациента не указан'); return; }

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <button class="btn-ghost btn-sm" onclick="navigate('patients')">← Назад</button>
      <h1 style="font-size:1.25rem;font-weight:700">Карточка пациента</h1>
    </div>
    <div id="patientDetailContent">${UI.pageLoader()}</div>
  `;

  try {
    const p = await api.patient(id);
    const age = p.date_of_birth
      ? Math.floor((Date.now() - new Date(p.date_of_birth)) / (1000*60*60*24*365))
      : null;

    document.getElementById('patientDetailContent').innerHTML = `
      <!-- Header card -->
      <div class="card" style="margin-bottom:16px;padding:20px">
        <div style="display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap">
          <div style="width:60px;height:60px;border-radius:14px;background:var(--c-primary-bg);
                      display:flex;align-items:center;justify-content:center;
                      font-size:22px;font-weight:700;color:var(--c-primary-d);flex-shrink:0">
            ${UI.initials(`${p.last_name} ${p.first_name}`)}
          </div>
          <div style="flex:1">
            <h2 style="font-size:1.2rem;font-weight:700;margin-bottom:4px">
              ${p.last_name} ${p.first_name} ${p.middle_name||''}
            </h2>
            <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--text-2);margin-bottom:12px">
              ${age ? `<span>🎂 ${age} лет</span>` : ''}
              <span>📞 <a href="tel:${p.phone}" style="color:var(--c-primary)">${p.phone}</a></span>
              ${p.email ? `<span>✉️ ${p.email}</span>` : ''}
              ${p.gender ? `<span>${p.gender === 'male' ? '♂ Мужской' : '♀ Женский'}</span>` : ''}
              ${p.date_of_birth ? `<span>📅 ${UI.fmtDate(p.date_of_birth)}</span>` : ''}
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn-primary btn-sm" onclick="Pages.showCreateApptModal()">+ Записать</button>
              <button class="btn-secondary btn-sm" onclick="Pages.showEditPatientModal('${p.id}')">✏️ Редактировать</button>
            </div>
          </div>
        </div>
        ${(p.allergies || p.chronic_diseases) ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            ${p.allergies ? `<div>
              <div style="font-size:11px;color:var(--c-danger);font-weight:600;text-transform:uppercase;margin-bottom:4px">⚠️ Аллергии</div>
              <div style="font-size:13px">${p.allergies}</div>
            </div>` : ''}
            ${p.chronic_diseases ? `<div>
              <div style="font-size:11px;color:var(--c-warning);font-weight:600;text-transform:uppercase;margin-bottom:4px">🩺 Хронические заболевания</div>
              <div style="font-size:13px">${p.chronic_diseases}</div>
            </div>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn active" onclick="Pages.switchPatientTab('visits',this)">Визиты (${p.appointments?.length||0})</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('treatments',this)">История лечения (${p.treatments?.length||0})</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('files',this)">Файлы и снимки (${p.files?.length||0})</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('notes',this)">Заметки</button>
      </div>

      <!-- Tab: Visits -->
      <div id="patientTab-visits">
        ${p.appointments?.length ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr><th>Дата и время</th><th>Врач</th><th>Услуга</th><th>Статус</th></tr></thead>
              <tbody>
                ${p.appointments.map(a => `
                  <tr>
                    <td style="font-family:var(--font-mono);font-size:13px">${UI.fmtDateTime(a.appointment_dt)}</td>
                    <td>${a.doctor_name||'—'}</td>
                    <td style="color:var(--text-2)">${a.service_name||'—'}</td>
                    <td>${UI.badge(a.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : UI.empty('📅','Нет визитов')}
      </div>

      <!-- Tab: Treatments -->
      <div id="patientTab-treatments" style="display:none">
        ${p.treatments?.length ? `
          <div style="display:flex;flex-direction:column;gap:12px">
            ${p.treatments.map(t => `
              <div class="card" style="padding:16px">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                  <div style="font-weight:600">${UI.fmtDate(t.visit_date)}</div>
                  <div style="font-size:13px;color:var(--text-3)">${t.doctor_name||''}</div>
                </div>
                ${t.diagnosis ? `<div style="margin-bottom:8px"><span style="font-size:11px;color:var(--text-3);text-transform:uppercase;font-weight:600">Диагноз</span><p style="font-size:13px;margin-top:3px">${t.diagnosis}</p></div>` : ''}
                ${t.treatment ? `<div style="margin-bottom:8px"><span style="font-size:11px;color:var(--text-3);text-transform:uppercase;font-weight:600">Лечение</span><p style="font-size:13px;margin-top:3px">${t.treatment}</p></div>` : ''}
                ${t.prescription ? `<div><span style="font-size:11px;color:var(--text-3);text-transform:uppercase;font-weight:600">Назначения</span><p style="font-size:13px;margin-top:3px">${t.prescription}</p></div>` : ''}
                ${t.total_cost ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-weight:600;color:var(--c-primary)">${UI.fmtMoney(t.total_cost)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : UI.empty('📋','Нет записей о лечении')}
      </div>

      <!-- Tab: Files -->
      <div id="patientTab-files" style="display:none">
        <div style="margin-bottom:16px">
          <input type="file" id="fileUploadInput" style="display:none" multiple
            accept=".jpg,.jpeg,.png,.pdf,.dcm,.doc,.docx" onchange="Pages.uploadPatientFile('${p.id}')" />
          <button class="btn-secondary" onclick="document.getElementById('fileUploadInput').click()">
            📎 Загрузить файл / рентген
          </button>
        </div>
        <div id="patientFilesList">
          ${p.files?.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
              ${p.files.map(f => `
                <div class="card" style="padding:14px">
                  <div style="font-size:24px;margin-bottom:8px">
                    ${f.file_type === 'xray' ? '🦴' : f.file_name.match(/\.(jpg|png|jpeg)$/i) ? '🖼️' : '📄'}
                  </div>
                  <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.file_name}">${f.file_name}</div>
                  <div style="font-size:11px;color:var(--text-3);margin-top:4px">${UI.fmtDate(f.created_at)}</div>
                  ${f.notes ? `<div style="font-size:11px;color:var(--text-2);margin-top:4px">${f.notes}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : UI.empty('📁','Нет файлов')}
        </div>
      </div>

      <!-- Tab: Notes -->
      <div id="patientTab-notes" style="display:none">
        <div class="card" style="padding:16px">
          <textarea class="form-textarea" id="patientNotesArea" style="min-height:150px">${p.notes||''}</textarea>
          <div style="margin-top:10px">
            <button class="btn-primary btn-sm" onclick="Pages.savePatientNotes('${p.id}')">Сохранить заметку</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    document.getElementById('patientDetailContent').innerHTML = UI.empty('⚠️','Ошибка загрузки пациента');
  }
};

Pages.switchPatientTab = (tab, btn) => {
  document.querySelectorAll('[id^="patientTab-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`patientTab-${tab}`).style.display = '';
  btn.classList.add('active');
};

Pages.savePatientNotes = async (id) => {
  const notes = document.getElementById('patientNotesArea').value;
  try {
    await api.updatePatient(id, { notes });
    UI.toast('Заметка сохранена', 'success');
  } catch (e) {
    UI.toast('Ошибка сохранения', 'error');
  }
};

Pages.uploadPatientFile = async (patientId) => {
  const input = document.getElementById('fileUploadInput');
  const files = input.files;
  if (!files.length) return;

  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('file_type', file.name.match(/\.(dcm)$/i) ? 'xray' : 'document');
    try {
      await api.upload(`/patients/${patientId}/files`, fd);
      UI.toast(`${file.name} загружен`, 'success');
    } catch (e) {
      UI.toast(`Ошибка: ${file.name}`, 'error');
    }
  }
  // Reload
  Pages.loadPatientDetail(document.getElementById('page-patient-detail'), { patientId });
};

Pages.showCreatePatientModal = () => {
  UI.showModal('Новый пациент', `
    <form id="createPatientForm" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Фамилия *</label>
          <input class="form-input" name="last_name" required />
        </div>
        <div class="form-group">
          <label class="form-label">Имя *</label>
          <input class="form-input" name="first_name" required />
        </div>
        <div class="form-group">
          <label class="form-label">Отчество</label>
          <input class="form-input" name="middle_name" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Телефон *</label>
          <input class="form-input" name="phone" type="tel" required placeholder="+996 XXX XXX XXX" />
        </div>
        <div class="form-group">
          <label class="form-label">Дата рождения</label>
          <input class="form-input" name="date_of_birth" type="date" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" name="email" type="email" />
        </div>
        <div class="form-group">
          <label class="form-label">Пол</label>
          <select class="form-select" name="gender">
            <option value="">Не указан</option>
            <option value="male">Мужской</option>
            <option value="female">Женский</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Адрес</label>
        <input class="form-input" name="address" />
      </div>
      <div class="form-group">
        <label class="form-label">⚠️ Аллергии</label>
        <textarea class="form-textarea" name="allergies" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">🩺 Хронические заболевания</label>
        <textarea class="form-textarea" name="chronic_diseases" rows="2"></textarea>
      </div>
      <button type="submit" class="btn-primary">Создать карточку</button>
    </form>
  `);

  document.getElementById('createPatientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const patient = await api.createPatient(body);
      UI.closeModal();
      UI.toast('Пациент создан', 'success');
      navigate('patient-detail', { patientId: patient.id });
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.showEditPatientModal = async (id) => {
  try {
    const p = await api.patient(id);
    UI.showModal('Редактировать пациента', `
      <form id="editPatientForm" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">Фамилия *</label>
            <input class="form-input" name="last_name" value="${p.last_name||''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Имя *</label>
            <input class="form-input" name="first_name" value="${p.first_name||''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Отчество</label>
            <input class="form-input" name="middle_name" value="${p.middle_name||''}" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group">
            <label class="form-label">Телефон *</label>
            <input class="form-input" name="phone" value="${p.phone||''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Дата рождения</label>
            <input class="form-input" name="date_of_birth" type="date" value="${p.date_of_birth ? p.date_of_birth.split('T')[0] : ''}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">⚠️ Аллергии</label>
          <textarea class="form-textarea" name="allergies" rows="2">${p.allergies||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">🩺 Хронические заболевания</label>
          <textarea class="form-textarea" name="chronic_diseases" rows="2">${p.chronic_diseases||''}</textarea>
        </div>
        <button type="submit" class="btn-primary">Сохранить изменения</button>
      </form>
    `);

    document.getElementById('editPatientForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try {
        await api.updatePatient(id, body);
        UI.closeModal();
        UI.toast('Данные обновлены', 'success');
        Pages.loadPatientDetail(document.getElementById('page-patient-detail'), { patientId: id });
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  } catch (_) {
    UI.toast('Ошибка загрузки', 'error');
  }
};
