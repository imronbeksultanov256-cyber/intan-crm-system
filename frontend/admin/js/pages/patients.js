// ============================================================
// INTAN CLINIC — patients.js v2
// Полная карточка: анамнез, зубная формула, план лечения, soft delete
// ============================================================

Pages.loadPatients = async (el) => {
  el.innerHTML = `
    <div class="page-header">
      <div><h1>Пациенты</h1></div>
      <div style="display:flex;gap:10px">
        ${App.user?.role === 'chief_doctor' ? `
          <button class="btn-secondary btn-sm" onclick="Pages.showTrashModal()">🗑 Корзина</button>
        ` : ''}
        <button class="btn-primary" onclick="Pages.showCreatePatientModal()">+ Новый пациент</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
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
      const res = await api.patients(
        `?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}&sortBy=${sortBy}`
      );
      renderPatientsList(res.data, res.total, res.page, res.limit);
    } catch (e) {
      document.getElementById('patientsList').innerHTML = UI.empty('⚠️','Ошибка загрузки');
    }
  };

  document.getElementById('patientSearch').addEventListener('input', UI.debounce(() => { page=1; load(); }, 350));
  document.getElementById('patientSort').addEventListener('change', () => { page=1; load(); });

  Pages._patientsGoPage = (pg) => { page = pg; load(); window.scrollTo({ top:0, behavior:'smooth' }); };
  await load();
};

function renderPatientsList(patients, total, curPage, lim) {
  const list = document.getElementById('patientsList');
  if (!patients?.length) {
    list.innerHTML = UI.empty('👥','Пациенты не найдены','Создайте нового пациента');
    return;
  }
  list.innerHTML = patients.map(p => {
    const age = p.date_of_birth
      ? Math.floor((Date.now() - new Date(p.date_of_birth)) / (365.25*24*3600*1000))
      : null;
    const initials = UI.initials(`${p.last_name} ${p.first_name}`);
    return `
      <div class="patient-card" onclick="navigate('patient-detail',{patientId:'${p.id}'})">
        <div class="patient-card__avatar">${initials}</div>
        <div style="flex:1;min-width:0">
          <div class="patient-card__name">${p.last_name} ${p.first_name} ${p.middle_name||''}</div>
          <div class="patient-card__meta">${age ? age+' лет · ':''} ${p.phone}</div>
          <div style="margin-top:4px;font-size:11px;color:var(--text-3)">
            ${p.visit_count||0} визит${p.visit_count==1?'':p.visit_count>4?'ов':'а'}
            · ${UI.fmtDate(p.created_at)}
          </div>
        </div>
      </div>`;
  }).join('');

  // Пагинация
  const pages = Math.ceil(total / lim);
  const pag = document.getElementById('patientsPagination');
  if (pages <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = `
    <button class="page-btn" ${curPage===1?'disabled':''} onclick="Pages._patientsGoPage(${curPage-1})">←</button>
    ${Array.from({length:Math.min(pages,5)},(_,i)=>{
      const pg = curPage<=3 ? i+1 : curPage-2+i;
      if (pg<1||pg>pages) return '';
      return `<button class="page-btn ${pg===curPage?'active':''}" onclick="Pages._patientsGoPage(${pg})">${pg}</button>`;
    }).join('')}
    <button class="page-btn" ${curPage===pages?'disabled':''} onclick="Pages._patientsGoPage(${curPage+1})">→</button>
    <span style="font-size:12px;color:var(--text-3);margin-left:8px">Всего: ${total}</span>
  `;
}

// ══════════════════════════════════════════════════════════
// КАРТОЧКА ПАЦИЕНТА v2
// ══════════════════════════════════════════════════════════

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
      ? Math.floor((Date.now()-new Date(p.date_of_birth))/(365.25*24*3600*1000))
      : null;

    document.getElementById('patientDetailContent').innerHTML = `
      <!-- Шапка -->
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
              ${p.gender === 'male' ? '<span>♂ Мужской</span>' : p.gender === 'female' ? '<span>♀ Женский</span>' : ''}
              ${p.date_of_birth ? `<span>📅 ${UI.fmtDate(p.date_of_birth)}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-primary btn-sm" onclick="Pages.showCreateApptModal()">+ Записать</button>
              <button class="btn-secondary btn-sm" onclick="Pages.showEditPatientModal('${p.id}')">✏️ Редактировать</button>
              ${(App.user?.role === 'chief_doctor' || App.user?.role === 'doctor') ? `
                <button class="btn-ghost btn-sm" style="color:var(--c-danger)"
                  onclick="Pages.confirmSoftDelete('${p.id}','${p.last_name} ${p.first_name}')">
                  🗑 В корзину
                </button>` : ''}
            </div>
          </div>
        </div>

        ${(p.allergies || p.chronic_diseases) ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;
                      margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            ${p.allergies ? `
              <div style="background:#fff1f1;border-radius:8px;padding:10px 14px">
                <div style="font-size:11px;color:var(--c-danger);font-weight:700;
                            text-transform:uppercase;margin-bottom:4px">⚠️ Аллергии</div>
                <div style="font-size:13px">${p.allergies}</div>
              </div>` : ''}
            ${p.chronic_diseases ? `
              <div style="background:#fffbeb;border-radius:8px;padding:10px 14px">
                <div style="font-size:11px;color:var(--c-warning);font-weight:700;
                            text-transform:uppercase;margin-bottom:4px">🩺 Хронические</div>
                <div style="font-size:13px">${p.chronic_diseases}</div>
              </div>` : ''}
          </div>` : ''}
      </div>

      <!-- Табы -->
      <div class="tabs">
        <button class="tab-btn active" onclick="Pages.switchPatientTab('visits',this)">
          📅 Визиты (${p.appointments?.length||0})
        </button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('dental',this)">
          🦷 Зубная карта
        </button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('anamnesis',this)">
          📋 Анамнез
        </button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('plans',this)">
          📝 Планы лечения
        </button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('treatments',this)">
          🩺 История лечения (${p.treatments?.length||0})
        </button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('files',this)">
          📁 Файлы (${p.files?.length||0})
        </button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('notes',this)">
          📝 Заметки
        </button>
      </div>

      <!-- Вкладка: Визиты -->
      <div id="patientTab-visits">
        ${p.appointments?.length ? `
          <div class="data-table-wrap">
            <table class="data-table">
              <thead><tr>
                <th>Дата и время</th><th>Врач</th><th>Услуга</th><th>Статус</th>
              </tr></thead>
              <tbody>
                ${p.appointments.map(a => `
                  <tr>
                    <td style="font-family:var(--font-mono)">${UI.fmtDateTime(a.appointment_dt)}</td>
                    <td>${a.doctor_name||'—'}</td>
                    <td style="color:var(--text-2)">${a.service_name||'—'}</td>
                    <td>${UI.badge(a.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : UI.empty('📅','Нет визитов')}
      </div>

      <!-- Вкладка: Зубная карта -->
      <div id="patientTab-dental" style="display:none">
        <div id="dentalChartContainer">${UI.pageLoader()}</div>
      </div>

      <!-- Вкладка: Анамнез -->
      <div id="patientTab-anamnesis" style="display:none">
        <div id="anamnesisContainer">${UI.pageLoader()}</div>
      </div>

      <!-- Вкладка: Планы лечения -->
      <div id="patientTab-plans" style="display:none">
        <div id="plansContainer">${UI.pageLoader()}</div>
      </div>

      <!-- Вкладка: История лечения -->
      <div id="patientTab-treatments" style="display:none">
        ${p.treatments?.length ? `
          <div style="display:flex;flex-direction:column;gap:12px">
            ${p.treatments.map(t => `
              <div class="card" style="padding:16px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                  <div style="font-weight:600">${UI.fmtDate(t.visit_date)}</div>
                  <div style="font-size:13px;color:var(--text-3)">${t.doctor_name||''}</div>
                </div>
                ${t.diagnosis ? `<div style="margin-bottom:6px"><span style="font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase">Диагноз</span><p style="font-size:13px;margin-top:2px">${t.diagnosis}</p></div>` : ''}
                ${t.treatment ? `<div style="margin-bottom:6px"><span style="font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase">Лечение</span><p style="font-size:13px;margin-top:2px">${t.treatment}</p></div>` : ''}
                ${t.total_cost ? `<div style="margin-top:8px;font-weight:700;color:var(--c-primary)">${UI.fmtMoney(t.total_cost)}</div>` : ''}
              </div>`).join('')}
          </div>` : UI.empty('📋','Нет записей о лечении')}
      </div>

      <!-- Вкладка: Файлы -->
      <div id="patientTab-files" style="display:none">
        <div style="margin-bottom:12px">
          <input type="file" id="fileUploadInput" style="display:none" multiple
            accept=".jpg,.jpeg,.png,.pdf,.dcm,.doc,.docx"
            onchange="Pages.uploadPatientFile('${p.id}')" />
          <button class="btn-secondary" onclick="document.getElementById('fileUploadInput').click()">
            📎 Загрузить файл / рентген
          </button>
        </div>
        <div id="patientFilesList">
          ${p.files?.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
              ${p.files.map(f => `
                <div class="card" style="padding:14px;cursor:pointer">
                  <div style="font-size:28px;margin-bottom:8px">
                    ${f.file_type==='xray'?'🦴':f.file_name.match(/\.(jpg|png|jpeg)$/i)?'🖼️':'📄'}
                  </div>
                  <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.file_name}</div>
                  <div style="font-size:11px;color:var(--text-3);margin-top:4px">${UI.fmtDate(f.created_at)}</div>
                </div>`).join('')}
            </div>` : UI.empty('📁','Нет файлов')}
        </div>
      </div>

      <!-- Вкладка: Заметки -->
      <div id="patientTab-notes" style="display:none">
        <div class="card" style="padding:16px">
          <textarea class="form-textarea" id="patientNotesArea" style="min-height:150px">${p.notes||''}</textarea>
          <div style="margin-top:10px">
            <button class="btn-primary btn-sm" onclick="Pages.savePatientNotes('${p.id}')">
              💾 Сохранить заметку
            </button>
          </div>
        </div>
      </div>
    `;

    // Загружаем зубную карту сразу в фоне
    Pages._loadDentalChart(id);
    Pages._loadAnamnesis(id);
    Pages._loadTreatmentPlans(id);

  } catch (e) {
    console.error(e);
    document.getElementById('patientDetailContent').innerHTML =
      UI.empty('⚠️','Ошибка загрузки пациента');
  }
};

Pages.switchPatientTab = (tab, btn) => {
  document.querySelectorAll('[id^="patientTab-"]').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`patientTab-${tab}`).style.display = '';
  btn.classList.add('active');
};

// ══════════════════════════════════════════════════════════
// ЗУБНАЯ ФОРМУЛА
// ══════════════════════════════════════════════════════════

const TOOTH_STATUS_LABELS = {
  healthy:          { label: 'Здоровый',        color: '#22c55e', bg: '#f0fdf4' },
  caries:           { label: 'Кариес',           color: '#f59e0b', bg: '#fffbeb' },
  filling:          { label: 'Пломба',           color: '#3b82f6', bg: '#eff6ff' },
  root_canal:       { label: 'Каналы',           color: '#8b5cf6', bg: '#f5f3ff' },
  crown:            { label: 'Коронка',          color: '#06b6d4', bg: '#ecfeff' },
  implant:          { label: 'Имплант',          color: '#0ea5e9', bg: '#e0f2fe' },
  veneer:           { label: 'Винир',            color: '#ec4899', bg: '#fdf2f8' },
  removed:          { label: 'Удалён',           color: '#ef4444', bg: '#fee2e2' },
  needs_treatment:  { label: 'Нужно лечение',   color: '#f97316', bg: '#fff7ed' },
  bridge:           { label: 'Мост',             color: '#64748b', bg: '#f1f5f9' },
  milk_tooth:       { label: 'Молочный',         color: '#a78bfa', bg: '#f5f3ff' },
};

Pages._loadDentalChart = async (patientId) => {
  const container = document.getElementById('dentalChartContainer');
  if (!container) return;

  try {
    const chart = await api.get(`/patients/${patientId}/dental-chart`);
    const chartMap = {};
    (chart || []).forEach(t => { chartMap[t.tooth_num] = t; });

    // FDI зубная формула
    // Квадранты: 1(11-18) 2(21-28) верхняя; 4(41-48) 3(31-38) нижняя
    const renderQuadrant = (quadrant, teeth, reverse = false) => {
      const nums = reverse ? [...teeth].reverse() : teeth;
      return nums.map(num => {
        const tooth = chartMap[num];
        const status = tooth?.status || 'healthy';
        const info = TOOTH_STATUS_LABELS[status];
        return `
          <div onclick="Pages.showToothModal('${patientId}',${num},'${status}')"
               title="${num} — ${info.label}${tooth?.notes ? '\n'+tooth.notes : ''}"
               style="
                 width:36px;height:44px;border-radius:6px;cursor:pointer;
                 background:${info.bg};border:2px solid ${info.color};
                 display:flex;flex-direction:column;align-items:center;
                 justify-content:center;transition:all 0.15s;font-size:10px;
                 color:${info.color};font-weight:600;
               "
               onmouseover="this.style.transform='scale(1.15)'"
               onmouseout="this.style.transform='scale(1)'">
            <span style="font-size:9px;opacity:0.7">${num}</span>
            <span style="font-size:14px">${getToothEmoji(status)}</span>
          </div>`;
      }).join('');
    };

    container.innerHTML = `
      <!-- Легенда -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
        ${Object.entries(TOOTH_STATUS_LABELS).map(([key, val]) => `
          <span style="
            background:${val.bg};color:${val.color};border:1px solid ${val.color};
            padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;
          " onclick="Pages.filterTeethByStatus('${key}')">${val.label}</span>
        `).join('')}
      </div>

      <!-- Зубная формула -->
      <div class="card" style="padding:20px;overflow-x:auto">
        <div style="min-width:600px">

          <!-- Верхняя челюсть -->
          <div style="text-align:center;font-size:11px;color:var(--text-3);margin-bottom:8px;font-weight:600">
            ВЕРХНЯЯ ЧЕЛЮСТЬ
          </div>
          <div style="display:flex;justify-content:center;gap:2px;margin-bottom:4px">
            <div style="display:flex;gap:2px">${renderQuadrant(1,[18,17,16,15,14,13,12,11])}</div>
            <div style="width:12px;border-right:2px dashed var(--border);margin:0 6px"></div>
            <div style="display:flex;gap:2px">${renderQuadrant(2,[21,22,23,24,25,26,27,28])}</div>
          </div>

          <!-- Разделитель -->
          <div style="border-top:2px dashed var(--border);margin:12px 0;position:relative">
            <span style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);
                         background:var(--surface);padding:0 8px;font-size:11px;color:var(--text-3)">
              Линия прикуса
            </span>
          </div>

          <!-- Нижняя челюсть -->
          <div style="display:flex;justify-content:center;gap:2px;margin-bottom:8px">
            <div style="display:flex;gap:2px">${renderQuadrant(4,[48,47,46,45,44,43,42,41])}</div>
            <div style="width:12px;border-right:2px dashed var(--border);margin:0 6px"></div>
            <div style="display:flex;gap:2px">${renderQuadrant(3,[31,32,33,34,35,36,37,38])}</div>
          </div>
          <div style="text-align:center;font-size:11px;color:var(--text-3);font-weight:600">
            НИЖНЯЯ ЧЕЛЮСТЬ
          </div>
        </div>
      </div>

      <p style="font-size:12px;color:var(--text-3);margin-top:8px;text-align:center">
        Нажмите на зуб чтобы изменить статус или просмотреть историю
      </p>
    `;
  } catch (e) {
    if (container) container.innerHTML = UI.empty('⚠️','Ошибка загрузки зубной формулы');
  }
};

function getToothEmoji(status) {
  const map = {
    healthy:'🦷', caries:'🟡', filling:'🔵', root_canal:'🟣',
    crown:'👑', implant:'🔩', veneer:'💎', removed:'✕',
    needs_treatment:'⚠️', bridge:'🌉', milk_tooth:'🍼'
  };
  return map[status] || '🦷';
}

Pages.showToothModal = async (patientId, toothNum, currentStatus) => {
  // Загружаем историю зуба
  let history = [];
  try {
    history = await api.get(`/patients/${patientId}/dental-chart/${toothNum}/history`);
  } catch (_) {}

  const info = TOOTH_STATUS_LABELS[currentStatus] || TOOTH_STATUS_LABELS.healthy;

  UI.showModal(`Зуб №${toothNum}`, `
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <span style="font-size:2rem">${getToothEmoji(currentStatus)}</span>
        <div>
          <div style="font-weight:600">Текущий статус</div>
          <span style="background:${info.bg};color:${info.color};padding:3px 10px;
                       border-radius:20px;font-size:12px;font-weight:600">${info.label}</span>
        </div>
      </div>

      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label">Изменить статус</label>
        <select class="form-select" id="toothStatusSelect">
          ${Object.entries(TOOTH_STATUS_LABELS).map(([key, val]) =>
            `<option value="${key}" ${key===currentStatus?'selected':''}>${val.label}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label">Заметка по зубу</label>
        <textarea class="form-textarea" id="toothNoteInput" rows="2"
          placeholder="Материал пломбы, дата процедуры..."></textarea>
      </div>

      <button class="btn-primary btn-block" onclick="Pages.saveToothStatus('${patientId}',${toothNum})">
        💾 Сохранить
      </button>
    </div>

    ${history.length ? `
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">История зуба</div>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto">
          ${history.map(h => `
            <div style="font-size:12px;background:var(--surface-2);padding:8px 12px;border-radius:8px">
              <div style="font-weight:500">${h.procedure_name||'Изменение статуса'}</div>
              <div style="color:var(--text-3);margin-top:2px">
                ${UI.fmtDate(h.procedure_date)} · ${h.doctor_name||'—'}
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
  `);
};

Pages.saveToothStatus = async (patientId, toothNum) => {
  const status = document.getElementById('toothStatusSelect')?.value;
  const notes  = document.getElementById('toothNoteInput')?.value;
  try {
    await api.put(`/patients/${patientId}/dental-chart/${toothNum}`, { status, notes });
    UI.closeModal();
    UI.toast('Статус зуба обновлён', 'success');
    Pages._loadDentalChart(patientId);
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

// ══════════════════════════════════════════════════════════
// АНАМНЕЗ
// ══════════════════════════════════════════════════════════

Pages._loadAnamnesis = async (patientId) => {
  const container = document.getElementById('anamnesisContainer');
  if (!container) return;

  try {
    const a = await api.get(`/patients/${patientId}/anamnesis`);
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:15px">Медицинский анамнез</span>
        <button class="btn-primary btn-sm" onclick="Pages.showAnamnesisForm('${patientId}')">
          ${a ? '✏️ Редактировать' : '+ Заполнить анамнез'}
        </button>
      </div>

      ${a ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          ${renderAnamnesisField('💬 Жалобы', a.complaints)}
          ${renderAnamnesisField('💊 Препараты', a.medications)}
          ${renderAnamnesisField('⚠️ Противопоказания', a.contraindications)}
          ${renderAnamnesisField('🏥 Перенесённые операции', a.past_surgeries)}
          ${renderAnamnesisField('🦷 Предыдущее лечение', a.previous_treatments)}
          ${renderAnamnesisField('📞 Экстренный контакт',
            a.emergency_contact_name ? `${a.emergency_contact_name} · ${a.emergency_contact_phone||''}` : null)}
          ${a.dental_anxiety ? `
            <div style="grid-column:1/-1;background:#fff1f1;border-radius:8px;padding:10px 14px;border-left:4px solid var(--c-danger)">
              <span style="color:var(--c-danger);font-weight:600">⚠️ Дентофобия — пациент боится стоматолога</span>
            </div>` : ''}
          ${a.last_dental_visit ? `
            <div>
              <div style="font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px">
                Последний визит к стоматологу
              </div>
              <div>${UI.fmtDate(a.last_dental_visit)}</div>
            </div>` : ''}
        </div>
      ` : UI.empty('📋','Анамнез не заполнен','Нажмите + Заполнить анамнез')}
    `;
  } catch (e) {
    if (container) container.innerHTML = UI.empty('⚠️','Ошибка загрузки анамнеза');
  }
};

function renderAnamnesisField(label, value) {
  if (!value) return '';
  return `
    <div style="background:var(--surface-2);border-radius:8px;padding:12px 14px">
      <div style="font-size:11px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px">
        ${label}
      </div>
      <div style="font-size:13px">${value}</div>
    </div>`;
}

Pages.showAnamnesisForm = async (patientId) => {
  let a = null;
  try { a = await api.get(`/patients/${patientId}/anamnesis`); } catch (_) {}

  UI.showModal('Медицинский анамнез', `
    <form id="anamnesisForm" style="display:flex;flex-direction:column;gap:12px">
      <div class="form-group">
        <label class="form-label">💬 Жалобы пациента</label>
        <textarea class="form-textarea" name="complaints" rows="2">${a?.complaints||''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">💊 Принимаемые препараты</label>
        <textarea class="form-textarea" name="medications" rows="2">${a?.medications||''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">⚠️ Противопоказания</label>
        <textarea class="form-textarea" name="contraindications" rows="2">${a?.contraindications||''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">🏥 Перенесённые операции</label>
        <textarea class="form-textarea" name="past_surgeries" rows="2">${a?.past_surgeries||''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">🦷 Предыдущее стоматологическое лечение</label>
        <textarea class="form-textarea" name="previous_treatments" rows="2">${a?.previous_treatments||''}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group">
          <label class="form-label">Экстренный контакт (имя)</label>
          <input class="form-input" name="emergency_contact_name" value="${a?.emergency_contact_name||''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Экстренный контакт (телефон)</label>
          <input class="form-input" name="emergency_contact_phone" value="${a?.emergency_contact_phone||''}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Последний визит к стоматологу</label>
        <input class="form-input" type="date" name="last_dental_visit"
          value="${a?.last_dental_visit ? a.last_dental_visit.split('T')[0] : ''}" />
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="dentalAnxiety" name="dental_anxiety"
          ${a?.dental_anxiety ? 'checked' : ''} style="width:16px;height:16px" />
        <label for="dentalAnxiety" style="font-size:13px">⚠️ Дентофобия (боится стоматолога)</label>
      </div>
      <button type="submit" class="btn-primary">💾 Сохранить анамнез</button>
    </form>
  `, 'lg');

  document.getElementById('anamnesisForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    body.dental_anxiety = document.getElementById('dentalAnxiety').checked;
    try {
      await api.put(`/patients/${patientId}/anamnesis`, body);
      UI.closeModal();
      UI.toast('Анамнез сохранён', 'success');
      Pages._loadAnamnesis(patientId);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

// ══════════════════════════════════════════════════════════
// ПЛАН ЛЕЧЕНИЯ
// ══════════════════════════════════════════════════════════

Pages._loadTreatmentPlans = async (patientId) => {
  const container = document.getElementById('plansContainer');
  if (!container) return;

  try {
    const plans = await api.get(`/patients/${patientId}/treatment-plans`);
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <span style="font-weight:600;font-size:15px">Планы лечения</span>
        <button class="btn-primary btn-sm" onclick="Pages.showCreatePlanModal('${patientId}')">
          + Новый план
        </button>
      </div>
      ${plans?.length ? plans.map(plan => renderPlan(plan, patientId)).join('') :
        UI.empty('📝','Нет планов лечения','Создайте план для пациента')}
    `;
  } catch (e) {
    if (container) container.innerHTML = UI.empty('⚠️','Ошибка загрузки планов');
  }
};

function renderPlan(plan, patientId) {
  const statusColors = { active:'badge--confirmed', completed:'badge--completed', cancelled:'badge--cancelled' };
  const statusLabels = { active:'Активный', completed:'Завершён', cancelled:'Отменён' };
  const done  = plan.items.filter(i => i.status === 'completed').length;
  const total = plan.items.length;
  const pct   = total > 0 ? Math.round(done/total*100) : 0;

  return `
    <div class="card" style="margin-bottom:12px;padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <span style="font-weight:600">${plan.title}</span>
          <span class="badge ${statusColors[plan.status]||'badge--pending'}" style="margin-left:8px">
            ${statusLabels[plan.status]||plan.status}
          </span>
        </div>
        <div style="font-size:12px;color:var(--text-3)">${UI.fmtDate(plan.created_at)}</div>
      </div>

      ${total > 0 ? `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span>Выполнено: ${done} / ${total}</span>
            <span style="font-weight:600;color:var(--c-primary)">${pct}%</span>
          </div>
          <div style="background:var(--surface-3);border-radius:4px;height:6px">
            <div style="width:${pct}%;background:var(--c-primary);border-radius:4px;height:6px;transition:width 0.8s"></div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">
          ${plan.items.map(item => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
                        background:var(--surface-2);border-radius:8px;font-size:13px">
              <span style="font-size:16px">
                ${item.status==='completed'?'✅':item.status==='in_progress'?'🔄':
                  item.status==='cancelled'?'❌':'⬜'}
              </span>
              <div style="flex:1">
                <div>${item.service_name||'—'}</div>
                ${item.tooth_num ? `<div style="font-size:11px;color:var(--text-3)">Зуб №${item.tooth_num}</div>` : ''}
              </div>
              ${item.price ? `<div style="font-weight:600;color:var(--c-primary)">${UI.fmtMoney(item.price)}</div>` : ''}
              ${item.status !== 'completed' ? `
                <button class="btn-icon btn-sm" title="Отметить выполненным"
                  onclick="Pages.completePlanItem('${item.id}','${patientId}')">✓</button>` : ''}
            </div>`).join('')}
        </div>
      ` : '<div style="color:var(--text-3);font-size:13px">Нет пунктов в плане</div>'}
    </div>`;
}

Pages.completePlanItem = async (itemId, patientId) => {
  try {
    await api.patch(`/treatment-plan-items/${itemId}`, {
      status: 'completed',
      completed_date: new Date().toISOString().split('T')[0],
    });
    UI.toast('Пункт выполнен', 'success');
    Pages._loadTreatmentPlans(patientId);
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

Pages.showCreatePlanModal = async (patientId) => {
  let services = [];
  try {
    const s = await api.services();
    services = s?.flat || [];
  } catch (_) {}

  UI.showModal('Новый план лечения', `
    <form id="createPlanForm" style="display:flex;flex-direction:column;gap:12px">
      <div class="form-group">
        <label class="form-label">Название плана</label>
        <input class="form-input" name="title" value="План лечения" required />
      </div>
      <div class="form-group">
        <label class="form-label">Примечания</label>
        <textarea class="form-textarea" name="notes" rows="2"></textarea>
      </div>
      <div id="planItems" style="display:flex;flex-direction:column;gap:8px">
        <div style="font-size:13px;font-weight:600">Пункты плана:</div>
      </div>
      <button type="button" class="btn-secondary btn-sm" onclick="Pages.addPlanItem()">
        + Добавить пункт
      </button>
      <button type="submit" class="btn-primary">Создать план</button>
    </form>
  `, 'lg');

  Pages._planItemCount = 0;
  Pages.addPlanItem();

  document.getElementById('createPlanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = [];
    for (let i = 0; i < Pages._planItemCount; i++) {
      const svc = fd.get(`item_service_${i}`);
      if (svc) items.push({
        service_id:   svc,
        service_name: document.querySelector(`#item_service_${i} option:checked`)?.textContent?.split('—')[0]?.trim(),
        tooth_num:    fd.get(`item_tooth_${i}`) ? parseInt(fd.get(`item_tooth_${i}`)) : null,
        priority:     parseInt(fd.get(`item_priority_${i}`)||'1'),
        price:        parseFloat(fd.get(`item_price_${i}`)||'0') || null,
        notes:        fd.get(`item_notes_${i}`),
      });
    }
    try {
      await api.post(`/patients/${patientId}/treatment-plans`, {
        title:   fd.get('title'),
        notes:   fd.get('notes'),
        items,
      });
      UI.closeModal();
      UI.toast('План лечения создан', 'success');
      Pages._loadTreatmentPlans(patientId);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.addPlanItem = () => {
  const i = Pages._planItemCount++;
  const container = document.getElementById('planItems');
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;align-items:start';
  div.innerHTML = `
    <select class="form-select" id="item_service_${i}" name="item_service_${i}">
      <option value="">Выберите услугу</option>
    </select>
    <input class="form-input" name="item_tooth_${i}" placeholder="Зуб №" type="number" min="11" max="48" />
    <input class="form-input" name="item_price_${i}" placeholder="Цена" type="number" />
    <select class="form-select" name="item_priority_${i}">
      <option value="1">🔴 Срочно</option>
      <option value="2" selected>🟡 Обычно</option>
      <option value="3">🟢 Планово</option>
    </select>
  `;
  container.appendChild(div);
};

// ══════════════════════════════════════════════════════════
// SOFT DELETE
// ══════════════════════════════════════════════════════════

Pages.confirmSoftDelete = (patientId, patientName) => {
  UI.showModal('Удалить пациента', `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:3rem;margin-bottom:12px">⚠️</div>
      <p style="font-size:15px;font-weight:600;margin-bottom:8px">
        Переместить в корзину?
      </p>
      <p style="color:var(--text-2);font-size:13px;margin-bottom:20px">
        <strong>${patientName}</strong> будет помещён в корзину.<br>
        Главный врач сможет восстановить пациента.
      </p>
      <div class="form-group" style="text-align:left;margin-bottom:16px">
        <label class="form-label">Причина удаления *</label>
        <textarea class="form-textarea" id="deleteReasonInput" rows="2"
          placeholder="Укажите причину..."></textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn-secondary" onclick="UI.closeModal()">Отмена</button>
        <button class="btn-danger" onclick="Pages.executeSoftDelete('${patientId}')">
          🗑 Переместить в корзину
        </button>
      </div>
    </div>
  `);
};

Pages.executeSoftDelete = async (patientId) => {
  const reason = document.getElementById('deleteReasonInput')?.value?.trim();
  if (!reason || reason.length < 3) {
    UI.toast('Укажите причину удаления', 'error'); return;
  }
  try {
    await api.request('DELETE', `/patients/${patientId}/soft`, { reason });
    UI.closeModal();
    UI.toast('Пациент перемещён в корзину', 'success');
    navigate('patients');
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

Pages.showTrashModal = async () => {
  UI.showModal('🗑 Корзина пациентов', `<div id="trashContent">${UI.skeleton(3,3)}</div>`, 'lg');
  try {
    const deleted = await api.get('/patients/trash');
    const content = document.getElementById('trashContent');
    if (!deleted?.length) {
      content.innerHTML = UI.empty('🗑','Корзина пуста');
      return;
    }
    content.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Пациент</th><th>Удалил</th><th>Причина</th><th>Дата</th><th></th>
          </tr></thead>
          <tbody>
            ${deleted.map(p => `
              <tr>
                <td style="font-weight:500">${p.last_name} ${p.first_name}</td>
                <td style="color:var(--text-2)">${p.deleted_by_name||'—'}</td>
                <td style="color:var(--text-2);font-size:12px">${p.delete_reason||'—'}</td>
                <td style="color:var(--text-3)">${UI.fmtDate(p.deleted_at)}</td>
                <td>
                  <button class="btn-secondary btn-sm"
                    onclick="Pages.restorePatient('${p.id}')">
                    ♻️ Восстановить
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    document.getElementById('trashContent').innerHTML = UI.empty('⚠️','Ошибка загрузки корзины');
  }
};

Pages.restorePatient = async (id) => {
  if (!UI.confirm('Восстановить пациента?')) return;
  try {
    await api.post(`/patients/${id}/restore`);
    UI.toast('Пациент восстановлен', 'success');
    Pages.showTrashModal(); // Обновляем корзину
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

// ══════════════════════════════════════════════════════════
// ОСТАЛЬНЫЕ МЕТОДЫ (без изменений)
// ══════════════════════════════════════════════════════════

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
  if (!input.files.length) return;
  for (const file of input.files) {
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
            <input class="form-input" name="date_of_birth" type="date"
              value="${p.date_of_birth ? p.date_of_birth.split('T')[0] : ''}" />
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
        Pages.loadPatientDetail(
          document.getElementById('page-patient-detail'), { patientId: id }
        );
      } catch (err) {
        UI.toast(err.message, 'error');
      }
    });
  } catch (_) {
    UI.toast('Ошибка загрузки', 'error');
  }
};
