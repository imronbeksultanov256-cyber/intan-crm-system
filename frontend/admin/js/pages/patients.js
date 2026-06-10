// ═══════════════════════════════════════════════════════════════
// PATIENTS — полноценная стоматологическая EMR v2.0
// ═══════════════════════════════════════════════════════════════

// ── Цвета и метки статусов зубов ───────────────────────────
const TOOTH_STATUSES = {
  healthy:          { label: 'Здоровый',         color: '#22c55e', bg: '#dcfce7' },
  caries:           { label: 'Кариес',            color: '#f97316', bg: '#ffedd5' },
  filling:          { label: 'Пломба',            color: '#3b82f6', bg: '#dbeafe' },
  root_canal:       { label: 'Лечение каналов',   color: '#8b5cf6', bg: '#ede9fe' },
  crown:            { label: 'Коронка',           color: '#0ea5e9', bg: '#e0f2fe' },
  implant:          { label: 'Имплант',           color: '#06b6d4', bg: '#cffafe' },
  veneer:           { label: 'Винир',             color: '#ec4899', bg: '#fce7f3' },
  removed:          { label: 'Удалён',            color: '#ef4444', bg: '#fee2e2' },
  needs_treatment:  { label: 'Требует лечения',   color: '#f59e0b', bg: '#fef3c7' },
  bridge:           { label: 'Мост',              color: '#64748b', bg: '#f1f5f9' },
  milk_tooth:       { label: 'Молочный',          color: '#a78bfa', bg: '#ede9fe' },
};

// Верхняя челюсть (нумерация FDI): 18..11 | 21..28
// Нижняя челюсть:                  48..41 | 31..38
const UPPER_RIGHT = [18,17,16,15,14,13,12,11];
const UPPER_LEFT  = [21,22,23,24,25,26,27,28];
const LOWER_RIGHT = [48,47,46,45,44,43,42,41];
const LOWER_LEFT  = [31,32,33,34,35,36,37,38];

// ═══════════════════════════════════════════════════════════════
// СПИСОК ПАЦИЕНТОВ
// ═══════════════════════════════════════════════════════════════
Pages.loadPatients = async (el) => {
  const isChief = App.user?.role === 'chief_doctor';

  el.innerHTML = `
    <div class="page-header">
      <div><h1>База пациентов</h1></div>
      <div style="display:flex;gap:10px">
        ${isChief ? `<button class="btn-secondary btn-sm" onclick="Pages.showDeletedPatients()">🗑 Корзина</button>` : ''}
        <button class="btn-primary" onclick="Pages.showCreatePatientModal()">+ Новый пациент</button>
      </div>
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
    <div id="patientsList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">
      ${[1,2,3,4,5,6].map(()=>`<div class="card" style="height:110px;background:var(--surface-2);animation:pulse 1.5s infinite"></div>`).join('')}
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

  document.getElementById('patientSearch').addEventListener('input', () => { page = 1; UI.debounce(load, 350)(); });
  document.getElementById('patientSort').addEventListener('change', () => { page = 1; load(); });
  await load();

  function renderPatients(patients, total, curPage, lim) {
    const list = document.getElementById('patientsList');
    if (!patients?.length) {
      list.innerHTML = UI.empty('👥','Пациенты не найдены','Попробуйте другой запрос или создайте нового');
      return;
    }
    list.innerHTML = patients.map(p => {
      const initials = UI.initials(`${p.last_name} ${p.first_name}`);
      const age = p.date_of_birth
        ? Math.floor((Date.now() - new Date(p.date_of_birth)) / (1000*60*60*24*365))
        : null;
      const lastVisit = p.last_visit ? UI.fmtDate(p.last_visit) : 'Нет визитов';
      return `
        <div class="patient-card" onclick="navigate('patient-detail',{patientId:'${p.id}'})">
          <div class="patient-card__avatar">${initials}</div>
          <div style="flex:1;min-width:0">
            <div class="patient-card__name">${p.last_name} ${p.first_name} ${p.middle_name||''}</div>
            <div class="patient-card__meta">
              ${age ? `${age} лет · ` : ''}${p.phone}
            </div>
            <div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--text-3)">
                📅 ${p.visit_count||0} визит${p.visit_count==1?'':p.visit_count>4?'ов':'а'}
              </span>
              <span style="font-size:11px;color:var(--text-3)">· ${lastVisit}</span>
            </div>
          </div>
        </div>`;
    }).join('');

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
      <span style="font-size:12px;color:var(--text-3);margin-left:8px">Всего: ${total}</span>`;
  }

  Pages._patientsGoPage = (pg) => { page = pg; load(); window.scrollTo({top:0,behavior:'smooth'}); };
};

// ═══════════════════════════════════════════════════════════════
// КАРТОЧКА ПАЦИЕНТА — полная EMR
// ═══════════════════════════════════════════════════════════════
Pages.loadPatientDetail = async (el, params) => {
  const id = params?.patientId;
  if (!id) { el.innerHTML = UI.empty('⚠️','ID пациента не указан'); return; }

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <button class="btn-ghost btn-sm" onclick="navigate('patients')">← Назад</button>
      <h1 style="font-size:1.2rem;font-weight:700">Карточка пациента</h1>
    </div>
    <div id="patientDetailContent">${UI.pageLoader()}</div>`;

  try {
    const p = await api.patient(id);
    const age = p.date_of_birth
      ? Math.floor((Date.now()-new Date(p.date_of_birth))/(1000*60*60*24*365))
      : null;
    const isChief = App.user?.role === 'chief_doctor';
    const canDelete = ['chief_doctor','doctor'].includes(App.user?.role);

    document.getElementById('patientDetailContent').innerHTML = `

      <!-- ── ШАПКА ── -->
      <div class="card" style="margin-bottom:14px;padding:20px">
        <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div style="width:64px;height:64px;border-radius:16px;background:var(--c-primary-bg);
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;font-weight:700;color:var(--c-primary-d);flex-shrink:0">
            ${UI.initials(`${p.last_name} ${p.first_name}`)}
          </div>
          <div style="flex:1;min-width:200px">
            <h2 style="font-size:1.15rem;font-weight:700;margin-bottom:6px">
              ${p.last_name} ${p.first_name} ${p.middle_name||''}
            </h2>
            <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--text-2);margin-bottom:12px">
              ${age ? `<span>🎂 ${age} лет</span>` : ''}
              <span>📞 <a href="tel:${p.phone}" style="color:var(--c-primary)">${p.phone}</a></span>
              ${p.email ? `<span>✉️ ${p.email}</span>` : ''}
              ${p.gender ? `<span>${p.gender==='male'?'♂ Мужской':'♀ Женский'}</span>` : ''}
              ${p.date_of_birth ? `<span>📅 ${UI.fmtDate(p.date_of_birth)}</span>` : ''}
              ${p.address ? `<span>📍 ${p.address}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-primary btn-sm" onclick="Pages.showCreateApptModal('${p.id}')">+ Записать</button>
              <button class="btn-secondary btn-sm" onclick="Pages.showEditPatientModal('${p.id}')">✏️ Редактировать</button>
              ${canDelete ? `<button class="btn-secondary btn-sm" style="color:var(--c-danger);border-color:var(--c-danger)" onclick="Pages.softDeletePatient('${p.id}','${p.last_name} ${p.first_name}')">🗑 Удалить</button>` : ''}
            </div>
          </div>
          <!-- Финансовый итог -->
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;margin-bottom:2px">Долг</div>
            <div style="font-size:1.3rem;font-weight:800;color:${p.finance?.debt > 0 ? 'var(--c-danger)' : 'var(--c-success)'}">${UI.fmtMoney(p.finance?.debt||0)}</div>
            <div style="font-size:11px;color:var(--text-3)">Оплачено: ${UI.fmtMoney(p.finance?.total_paid||0)}</div>
          </div>
        </div>
        ${(p.allergies||p.chronic_diseases) ? `
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            ${p.allergies ? `<div style="background:#fee2e2;border-radius:8px;padding:8px 12px;flex:1;min-width:180px">
              <div style="font-size:10px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:3px">⚠️ Аллергии</div>
              <div style="font-size:13px;color:var(--text)">${p.allergies}</div>
            </div>` : ''}
            ${p.chronic_diseases ? `<div style="background:#fef3c7;border-radius:8px;padding:8px 12px;flex:1;min-width:180px">
              <div style="font-size:10px;color:#d97706;font-weight:700;text-transform:uppercase;margin-bottom:3px">🩺 Хронические заболевания</div>
              <div style="font-size:13px;color:var(--text)">${p.chronic_diseases}</div>
            </div>` : ''}
          </div>` : ''}
      </div>

      <!-- ── ВКЛАДКИ ── -->
      <div class="tabs" style="margin-bottom:16px">
        <button class="tab-btn active" onclick="Pages.switchPatientTab('dental',this)">🦷 Зубная формула</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('anamnesis',this)">📋 Анамнез</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('plan',this)">📝 План лечения</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('visits',this)">📅 Визиты (${p.appointments?.length||0})</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('treatments',this)">💊 История лечения</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('files',this)">🖼 Файлы (${p.files?.length||0})</button>
        <button class="tab-btn" onclick="Pages.switchPatientTab('notes',this)">📌 Заметки</button>
      </div>

      <!-- ── ТАБ: ЗУБНАЯ ФОРМУЛА ── -->
      <div id="patientTab-dental">
        ${renderDentalChart(p.dental_chart||[], p.id)}
      </div>

      <!-- ── ТАБ: АНАМНЕЗ ── -->
      <div id="patientTab-anamnesis" style="display:none">
        ${renderAnamnesisTab(p.anamnesis, p.id)}
      </div>

      <!-- ── ТАБ: ПЛАН ЛЕЧЕНИЯ ── -->
      <div id="patientTab-plan" style="display:none">
        ${renderTreatmentPlanTab(p.treatment_plans||[], p.id)}
      </div>

      <!-- ── ТАБ: ВИЗИТЫ ── -->
      <div id="patientTab-visits" style="display:none">
        <div class="card">
          <div class="card__header">
            <span class="card__title">История визитов</span>
            <button class="btn-primary btn-sm" onclick="Pages.showCreateApptModal('${p.id}')">+ Новая запись</button>
          </div>
          ${p.appointments?.length ? `
            <div class="data-table-wrap">
              <table class="data-table">
                <thead><tr><th>Дата и время</th><th>Врач</th><th>Услуга</th><th>Статус</th></tr></thead>
                <tbody>
                  ${p.appointments.map(a=>`
                    <tr>
                      <td style="font-family:var(--font-mono);font-size:12px">${UI.fmtDateTime(a.appointment_dt)}</td>
                      <td>${a.doctor_name||'—'}</td>
                      <td style="color:var(--text-2)">${a.service_name||'—'}</td>
                      <td>${UI.badge(a.status)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>` : UI.empty('📅','Нет визитов')}
        </div>
      </div>

      <!-- ── ТАБ: ИСТОРИЯ ЛЕЧЕНИЯ ── -->
      <div id="patientTab-treatments" style="display:none">
        <div class="card">
          <div class="card__header"><span class="card__title">Записи о лечении</span></div>
          ${p.treatments?.length ? `
            <div style="display:flex;flex-direction:column;gap:12px;padding:16px">
              ${p.treatments.map(t=>`
                <div style="border:1px solid var(--border);border-radius:10px;padding:14px">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:6px">
                    <div>
                      <div style="font-weight:600;font-size:14px">${UI.fmtDate(t.visit_date)}</div>
                      <div style="font-size:12px;color:var(--text-3)">${t.doctor_name||'—'}</div>
                    </div>
                    ${t.total_cost ? `<div style="font-weight:700;color:var(--c-primary)">${UI.fmtMoney(t.total_cost)}</div>` : ''}
                  </div>
                  ${t.diagnosis ? `<div style="margin-bottom:6px"><span style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase">Диагноз:</span><div style="font-size:13px;margin-top:2px">${t.diagnosis}</div></div>` : ''}
                  ${t.treatment ? `<div style="margin-bottom:6px"><span style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase">Лечение:</span><div style="font-size:13px;margin-top:2px">${t.treatment}</div></div>` : ''}
                  ${t.prescription ? `<div><span style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase">Назначения:</span><div style="font-size:13px;margin-top:2px">${t.prescription}</div></div>` : ''}
                  ${t.services?.length ? `
                    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
                      <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;margin-bottom:6px">Услуги:</div>
                      ${t.services.map(s=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>${s.service_name||'—'}</span><span style="color:var(--c-primary);font-weight:600">${UI.fmtMoney(s.price)}</span></div>`).join('')}
                    </div>` : ''}
                </div>`).join('')}
            </div>` : UI.empty('💊','Нет записей о лечении')}
        </div>
      </div>

      <!-- ── ТАБ: ФАЙЛЫ ── -->
      <div id="patientTab-files" style="display:none">
        <div class="card">
          <div class="card__header">
            <span class="card__title">Документы, фото и снимки</span>
            <label class="btn-primary btn-sm" style="cursor:pointer">
              📎 Загрузить файл
              <input type="file" id="fileUploadInput" multiple accept="image/*,.pdf,.dcm,.doc,.docx" style="display:none" onchange="Pages.uploadPatientFile('${p.id}')">
            </label>
          </div>
          ${p.files?.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:16px">
              ${p.files.map(f=>{
                const icon = f.file_type==='xray'?'🔬':f.file_type==='photo'?'📷':f.file_type==='analysis'?'🧪':'📄';
                const typeLabel = {xray:'Рентген',photo:'Фото',analysis:'Анализ',document:'Документ'}[f.file_type]||f.file_type;
                return `
                  <div style="border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px">
                    <div style="font-size:28px;text-align:center">${icon}</div>
                    <div style="font-size:12px;font-weight:600;text-align:center;word-break:break-all">${f.file_name}</div>
                    <div style="font-size:11px;color:var(--text-3);text-align:center">${typeLabel} · ${UI.fmtDate(f.created_at)}</div>
                    ${f.notes ? `<div style="font-size:11px;color:var(--text-2);text-align:center">${f.notes}</div>` : ''}
                    <a href="/uploads/${f.file_path?.split('/').pop()}" target="_blank" class="btn-secondary btn-sm" style="text-align:center">Открыть</a>
                  </div>`; }).join('')}
            </div>` : UI.empty('🖼','Файлов пока нет','Загрузите рентген-снимки, фото или документы')}
        </div>
      </div>

      <!-- ── ТАБ: ЗАМЕТКИ ── -->
      <div id="patientTab-notes" style="display:none">
        <div class="card" style="padding:16px">
          <div class="card__header" style="margin-bottom:12px"><span class="card__title">Общие заметки</span></div>
          <textarea class="form-textarea" id="patientNotesArea" style="min-height:180px;width:100%">${p.notes||''}</textarea>
          <button class="btn-primary btn-sm" style="margin-top:10px" onclick="Pages.savePatientNotes('${p.id}')">💾 Сохранить</button>
        </div>
      </div>
    `;

    // Активируем первую вкладку
    Pages.switchPatientTab('dental', document.querySelector('.tab-btn.active'));

  } catch (e) {
    console.error(e);
    document.getElementById('patientDetailContent').innerHTML = UI.empty('⚠️','Ошибка загрузки пациента');
  }
};

// ═══════════════════════════════════════════════════════════════
// ЗУБНАЯ ФОРМУЛА
// ═══════════════════════════════════════════════════════════════
function renderDentalChart(chartData, patientId) {
  // Строим Map: tooth_num → status
  const chartMap = {};
  chartData.forEach(t => { chartMap[t.tooth_num] = t; });

  function toothCell(num) {
    const tooth = chartMap[num];
    const st = tooth?.status || 'healthy';
    const info = TOOTH_STATUSES[st] || TOOTH_STATUSES.healthy;
    const isChild = num >= 51 && num <= 85; // молочные
    return `
      <div class="tooth-cell" onclick="Pages.showToothModal('${patientId}',${num})"
           title="Зуб ${num}: ${info.label}"
           style="background:${info.bg};border-color:${info.color}">
        <div class="tooth-cell__num">${num}</div>
        <div class="tooth-cell__icon" style="color:${info.color}">🦷</div>
        <div class="tooth-cell__status" style="color:${info.color}">${info.label.substring(0,6)}</div>
      </div>`;
  }

  const legendHtml = Object.entries(TOOTH_STATUSES).map(([key, val]) =>
    `<div style="display:flex;align-items:center;gap:4px;white-space:nowrap">
       <div style="width:10px;height:10px;border-radius:2px;background:${val.bg};border:1px solid ${val.color}"></div>
       <span style="font-size:11px;color:var(--text-2)">${val.label}</span>
     </div>`
  ).join('');

  return `
    <div class="card" style="padding:20px">
      <div class="card__header" style="margin-bottom:16px">
        <span class="card__title">🦷 Зубная формула (FDI)</span>
        <div style="font-size:12px;color:var(--text-3)">Нажмите на зуб для просмотра и редактирования</div>
      </div>

      <!-- Верхняя челюсть -->
      <div style="text-align:center;font-size:11px;font-weight:600;color:var(--text-3);margin-bottom:6px;text-transform:uppercase">Верхняя челюсть</div>
      <div style="display:flex;justify-content:center;gap:3px;margin-bottom:4px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px">
        ${UPPER_RIGHT.map(n=>toothCell(n)).join('')}
        <div style="width:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><div style="width:1px;height:60px;background:var(--border)"></div></div>
        ${UPPER_LEFT.map(n=>toothCell(n)).join('')}
      </div>

      <!-- Линия разделения -->
      <div style="border-top:2px dashed var(--border);margin:10px auto;max-width:700px"></div>

      <!-- Нижняя челюсть -->
      <div style="display:flex;justify-content:center;gap:3px;margin-bottom:6px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px">
        ${LOWER_RIGHT.map(n=>toothCell(n)).join('')}
        <div style="width:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><div style="width:1px;height:60px;background:var(--border)"></div></div>
        ${LOWER_LEFT.map(n=>toothCell(n)).join('')}
      </div>
      <div style="text-align:center;font-size:11px;font-weight:600;color:var(--text-3);margin-top:4px;text-transform:uppercase">Нижняя челюсть</div>

      <!-- Легенда -->
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
        ${legendHtml}
      </div>
    </div>

    <style>
      .tooth-cell {
        width: 54px; min-width: 54px; height: 68px;
        border: 1.5px solid; border-radius: 8px;
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; gap: 1px;
        cursor: pointer; transition: transform .15s, box-shadow .15s;
        user-select: none; flex-shrink: 0;
      }
      .tooth-cell:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,.15); }
      .tooth-cell__num  { font-size: 10px; font-weight: 700; color: var(--text-3); line-height: 1; }
      .tooth-cell__icon { font-size: 18px; line-height: 1; }
      .tooth-cell__status { font-size: 8px; font-weight: 600; line-height: 1; text-align: center; }
    </style>
  `;
}

// ── Модал зуба ─────────────────────────────────────────────
Pages.showToothModal = async (patientId, toothNum) => {
  // Загружаем историю зуба
  let history = [];
  try {
    history = await api.getToothHistory(patientId, toothNum);
  } catch(_) {}

  const historyHtml = history.length
    ? history.map(h=>`
        <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-3);white-space:nowrap;min-width:80px">${UI.fmtDate(h.procedure_date)}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:500">${h.procedure_name||'Изменение статуса'}</div>
            <div style="font-size:11px;color:var(--text-3)">${h.doctor_name||'—'} · ${TOOTH_STATUSES[h.status_before]?.label||h.status_before} → ${TOOTH_STATUSES[h.status_after]?.label||h.status_after}</div>
            ${h.notes ? `<div style="font-size:11px;color:var(--text-2);margin-top:2px">${h.notes}</div>` : ''}
          </div>
        </div>`).join('')
    : `<div style="color:var(--text-3);font-size:13px;padding:12px 0">История пуста</div>`;

  const statusOptions = Object.entries(TOOTH_STATUSES)
    .map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');

  UI.showModal(`🦷 Зуб ${toothNum}`, `
    <div style="display:flex;flex-direction:column;gap:16px">

      <!-- Редактирование -->
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;margin-bottom:8px">Изменить статус</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <select class="form-select" id="toothStatus">${statusOptions}</select>
          <textarea class="form-textarea" id="toothNotes" placeholder="Заметка по зубу (процедура, материал...)" rows="2"></textarea>
          <button class="btn-primary" onclick="Pages.saveToothStatus('${patientId}',${toothNum})">💾 Сохранить статус</button>
        </div>
      </div>

      <!-- История -->
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;margin-bottom:6px">История лечения зуба</div>
        <div style="max-height:200px;overflow-y:auto">${historyHtml}</div>
      </div>
    </div>
  `);
};

Pages.saveToothStatus = async (patientId, toothNum) => {
  const status = document.getElementById('toothStatus').value;
  const notes  = document.getElementById('toothNotes').value;
  try {
    await api.updateTooth(patientId, { tooth_num: toothNum, status, notes });
    UI.closeModal();
    UI.toast(`Зуб ${toothNum} обновлён`, 'success');
    // Обновить страницу пациента
    Pages.loadPatientDetail(document.getElementById('page-patient-detail'), { patientId });
  } catch (e) {
    UI.toast('Ошибка сохранения', 'error');
  }
};

// ═══════════════════════════════════════════════════════════════
// АНАМНЕЗ
// ═══════════════════════════════════════════════════════════════
function renderAnamnesisTab(anamnesis, patientId) {
  const a = anamnesis || {};
  return `
    <div class="card" style="padding:20px">
      <div class="card__header" style="margin-bottom:16px">
        <span class="card__title">📋 Медицинский анамнез</span>
        <button class="btn-primary btn-sm" onclick="Pages.saveAnamnesis('${patientId}')">💾 Сохранить анамнез</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Жалобы пациента</label>
          <textarea class="form-textarea" id="an_complaints" rows="3">${a.complaints||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Анамнез жизни</label>
          <textarea class="form-textarea" id="an_life_anamnesis" rows="3">${a.life_anamnesis||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Анамнез заболевания</label>
          <textarea class="form-textarea" id="an_disease_anamnesis" rows="3">${a.disease_anamnesis||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Принимаемые препараты</label>
          <textarea class="form-textarea" id="an_medications" rows="3">${a.medications||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Перенесённые операции</label>
          <textarea class="form-textarea" id="an_past_surgeries" rows="2">${a.past_surgeries||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Противопоказания</label>
          <textarea class="form-textarea" id="an_contraindications" rows="2">${a.contraindications||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Предыдущее стоматологическое лечение</label>
          <textarea class="form-textarea" id="an_previous_treatments" rows="2">${a.previous_treatments||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Последний визит к стоматологу</label>
          <input class="form-input" id="an_last_dental_visit" type="date" value="${a.last_dental_visit ? a.last_dental_visit.split('T')[0] : ''}" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="an_dental_anxiety" ${a.dental_anxiety?'checked':''} style="width:16px;height:16px">
            <span class="form-label" style="margin:0">😰 Страх перед стоматологом (дентофобия)</span>
          </label>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:4px">
        <div style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;margin-bottom:12px">Экстренный контакт</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">ФИО контактного лица</label>
            <input class="form-input" id="an_emergency_name" value="${a.emergency_contact_name||''}" placeholder="Имя родственника или друга" />
          </div>
          <div class="form-group">
            <label class="form-label">Телефон</label>
            <input class="form-input" id="an_emergency_phone" value="${a.emergency_contact_phone||''}" placeholder="+996 XXX XXX XXX" />
          </div>
        </div>
      </div>
    </div>`;
}

Pages.saveAnamnesis = async (patientId) => {
  const body = {
    complaints:              document.getElementById('an_complaints')?.value,
    life_anamnesis:          document.getElementById('an_life_anamnesis')?.value,
    disease_anamnesis:       document.getElementById('an_disease_anamnesis')?.value,
    medications:             document.getElementById('an_medications')?.value,
    past_surgeries:          document.getElementById('an_past_surgeries')?.value,
    contraindications:       document.getElementById('an_contraindications')?.value,
    previous_treatments:     document.getElementById('an_previous_treatments')?.value,
    last_dental_visit:       document.getElementById('an_last_dental_visit')?.value || null,
    dental_anxiety:          document.getElementById('an_dental_anxiety')?.checked || false,
    emergency_contact_name:  document.getElementById('an_emergency_name')?.value,
    emergency_contact_phone: document.getElementById('an_emergency_phone')?.value,
  };
  try {
    await api.saveAnamnesis(patientId, body);
    UI.toast('Анамнез сохранён', 'success');
  } catch(e) {
    UI.toast('Ошибка сохранения', 'error');
  }
};

// ═══════════════════════════════════════════════════════════════
// ПЛАН ЛЕЧЕНИЯ
// ═══════════════════════════════════════════════════════════════
function renderTreatmentPlanTab(plans, patientId) {
  const priorityLabel = { 1:'🔴 Срочно', 2:'🟡 Плановое', 3:'🟢 Профилактика' };
  const statusColors  = { planned:'var(--text-3)', in_progress:'var(--c-warning)', completed:'var(--c-accent)', cancelled:'var(--c-danger)' };
  const statusLabels  = { planned:'Запланировано', in_progress:'В процессе', completed:'Завершено', cancelled:'Отменено' };

  const plansHtml = plans.length
    ? plans.map(plan=>`
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:6px">
            <div>
              <div style="font-weight:700;font-size:15px">${plan.title}</div>
              <div style="font-size:12px;color:var(--text-3)">${plan.doctor_name||'—'} · ${UI.fmtDate(plan.created_at)}</div>
            </div>
            <span class="badge ${plan.status==='active'?'badge--confirmed':'badge--pending'}">${plan.status==='active'?'Активен':'Завершён'}</span>
          </div>
          ${plan.items?.length ? `
            <div style="display:flex;flex-direction:column;gap:6px">
              ${plan.items.map(item=>`
                <div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--surface-2);border-radius:8px">
                  <div style="font-size:13px;flex:1">
                    ${item.tooth_num ? `<span style="font-size:11px;background:var(--c-primary-bg);color:var(--c-primary);padding:2px 6px;border-radius:4px;margin-right:6px">Зуб ${item.tooth_num}</span>` : ''}
                    ${item.service_name}
                  </div>
                  <div style="font-size:11px;color:var(--text-3)">${priorityLabel[item.priority]||''}</div>
                  ${item.price ? `<div style="font-weight:600;color:var(--c-primary);font-size:13px;white-space:nowrap">${UI.fmtMoney(item.price)}</div>` : ''}
                  <div style="font-size:11px;color:${statusColors[item.status]};font-weight:600;white-space:nowrap">${statusLabels[item.status]||item.status}</div>
                  ${item.status !== 'completed' ? `
                    <button class="btn-secondary btn-sm" style="font-size:11px;padding:3px 8px" onclick="Pages.completePlanItem('${patientId}','${plan.id}','${item.id}')">✓</button>` : ''}
                </div>`).join('')}
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);text-align:right;font-weight:700;color:var(--c-primary)">
              Итого: ${UI.fmtMoney(plan.items.reduce((s,i)=>s+(parseFloat(i.price)||0),0))}
            </div>` : '<div style="color:var(--text-3);font-size:13px">Позиции не добавлены</div>'}
        </div>`).join('')
    : UI.empty('📝','Планов лечения нет','Создайте план для пациента');

  return `
    <div class="card" style="padding:20px">
      <div class="card__header" style="margin-bottom:16px">
        <span class="card__title">📝 Планы лечения</span>
        <button class="btn-primary btn-sm" onclick="Pages.showCreatePlanModal('${patientId}')">+ Новый план</button>
      </div>
      ${plansHtml}
    </div>`;
}

Pages.completePlanItem = async (patientId, planId, itemId) => {
  try {
    await api.completePlanItem(patientId, planId, itemId);
    UI.toast('Позиция отмечена выполненной', 'success');
    Pages.loadPatientDetail(document.getElementById('page-patient-detail'), { patientId });
  } catch(e) {
    UI.toast('Ошибка', 'error');
  }
};

Pages.showCreatePlanModal = async (patientId) => {
  let services = [];
  try {
    const res = await api.services('?activeOnly=true');
    services = res.flat || [];
  } catch(_) {}

  UI.showModal('Новый план лечения', `
    <form id="createPlanForm" style="display:flex;flex-direction:column;gap:12px">
      <div class="form-group">
        <label class="form-label">Название плана</label>
        <input class="form-input" name="title" value="План лечения" required />
      </div>
      <div class="form-group">
        <label class="form-label">Заметки</label>
        <textarea class="form-textarea" name="notes" rows="2"></textarea>
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-3);text-transform:uppercase;margin-bottom:8px">Позиции плана</div>
        <div id="planItems"></div>
        <button type="button" class="btn-secondary btn-sm" style="margin-top:8px" onclick="Pages.addPlanItem(${JSON.stringify(services.map(s=>({id:s.id,name:s.name,price:s.price}))).replace(/"/g,"'")})">+ Добавить позицию</button>
      </div>
      <button type="submit" class="btn-primary">Создать план</button>
    </form>
  `);

  document.getElementById('createPlanForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const items = [];
    document.querySelectorAll('.plan-item-row').forEach(row => {
      items.push({
        service_name: row.querySelector('.pi-name')?.value,
        price: parseFloat(row.querySelector('.pi-price')?.value)||0,
        tooth_num: parseInt(row.querySelector('.pi-tooth')?.value)||null,
        priority: parseInt(row.querySelector('.pi-priority')?.value)||1,
      });
    });
    try {
      await api.createTreatmentPlan(patientId, { title: formData.get('title'), notes: formData.get('notes'), items });
      UI.closeModal();
      UI.toast('План создан', 'success');
      Pages.loadPatientDetail(document.getElementById('page-patient-detail'), { patientId });
    } catch(err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.addPlanItem = (services) => {
  const container = document.getElementById('planItems');
  const div = document.createElement('div');
  div.className = 'plan-item-row';
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 60px 80px 30px;gap:6px;margin-bottom:8px;align-items:center';
  div.innerHTML = `
    <input class="form-input pi-name" placeholder="Услуга" style="font-size:12px" />
    <input class="form-input pi-price" type="number" placeholder="Цена" style="font-size:12px" />
    <input class="form-input pi-tooth" type="number" placeholder="Зуб" min="11" max="48" style="font-size:12px" />
    <select class="form-select pi-priority" style="font-size:12px">
      <option value="1">🔴 Срочно</option>
      <option value="2" selected>🟡 Планово</option>
      <option value="3">🟢 Профил.</option>
    </select>
    <button type="button" onclick="this.parentElement.remove()" style="color:var(--c-danger);background:none;border:none;cursor:pointer;font-size:16px">×</button>`;
  container.appendChild(div);
};

// ═══════════════════════════════════════════════════════════════
// SOFT DELETE — корзина
// ═══════════════════════════════════════════════════════════════
Pages.softDeletePatient = (id, name) => {
  UI.showModal('🗑 Удаление пациента', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="background:#fee2e2;border-radius:10px;padding:14px">
        <div style="font-weight:700;color:#ef4444;margin-bottom:6px">⚠️ Внимание!</div>
        <div style="font-size:13px;color:var(--text)">
          Пациент <strong>${name}</strong> будет перемещён в корзину.<br>
          Данные сохранятся и могут быть восстановлены главным врачом.
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Причина удаления *</label>
        <textarea class="form-textarea" id="deleteReason" rows="2" placeholder="Укажите причину..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" style="color:var(--c-danger)">Для подтверждения введите слово <strong>УДАЛИТЬ</strong></label>
        <input class="form-input" id="deleteConfirmWord" placeholder="УДАЛИТЬ" style="border-color:var(--c-danger)" />
      </div>
      <button class="btn-primary" style="background:var(--c-danger)" onclick="Pages.confirmSoftDelete('${id}')">
        Переместить в корзину
      </button>
    </div>
  `);
};

Pages.confirmSoftDelete = async (id) => {
  const confirm_word = document.getElementById('deleteConfirmWord')?.value?.trim()?.toLowerCase();
  const reason       = document.getElementById('deleteReason')?.value?.trim();
  if (confirm_word !== 'удалить') { UI.toast('Введите слово УДАЛИТЬ', 'error'); return; }
  if (!reason || reason.length < 5) { UI.toast('Укажите причину удаления', 'error'); return; }
  try {
    await api.deletePatient(id, { confirm_word: 'УДАЛИТЬ', reason });
    UI.closeModal();
    UI.toast('Пациент перемещён в корзину', 'success');
    navigate('patients');
  } catch(e) {
    UI.toast(e.message || 'Ошибка удаления', 'error');
  }
};

// ── Корзина (только chief_doctor) ─────────────────────────
Pages.showDeletedPatients = async () => {
  UI.showModal('🗑 Корзина пациентов', `
    <div id="trashedContent">${UI.pageLoader()}</div>
  `);
  try {
    const res = await api.patients('?includeDeleted=true&limit=50');
    const deleted = res.data.filter(p => p.is_deleted);
    if (!deleted.length) {
      document.getElementById('trashedContent').innerHTML = UI.empty('🗑','Корзина пуста');
      return;
    }
    document.getElementById('trashedContent').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">
        ${deleted.map(p=>`
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--border);border-radius:8px">
            <div>
              <div style="font-weight:600;font-size:13px">${p.last_name} ${p.first_name}</div>
              <div style="font-size:11px;color:var(--text-3)">${p.phone} · Удалён: ${UI.fmtDate(p.deleted_at)}</div>
            </div>
            <div style="display:flex;gap:4px">
              <button class="btn-secondary btn-sm" onclick="Pages.restorePatient('${p.id}')" title="Восстановить">♻️</button>
              <button class="btn-secondary btn-sm" onclick="Pages.permanentDeletePatient('${p.id}','${p.last_name} ${p.first_name}')" style="color:var(--c-danger)" title="Удалить навсегда">🗑</button>
            </div>
          </div>`).join('')}
      </div>`;
  } catch(e) {
    document.getElementById('trashedContent').innerHTML = UI.empty('⚠️','Ошибка загрузки');
  }
};

Pages.permanentDeletePatient = async (id, name) => {
  if (!confirm(`Вы уверены, что хотите НАВСЕГДА удалить данные пациента ${name}? Это действие нельзя отменить.`)) return;
  try {
    await api.del(`/patients/${id}/permanent`, { confirm_word: 'УДАЛИТЬ НАВСЕГДА' });
    UI.toast('Пациент удалён окончательно', 'success');
    UI.closeModal();
    Pages.loadPatients(document.getElementById('page-patients'));
  } catch(e) {
    UI.toast(e.message || 'Ошибка удаления', 'error');
  }
};

Pages.restorePatient = async (id) => {
  try {
    await api.restorePatient(id);
    UI.closeModal();
    UI.toast('Пациент восстановлен', 'success');
    Pages.loadPatients(document.getElementById('page-patients'));
  } catch(e) {
    UI.toast(e.message || 'Ошибка восстановления', 'error');
  }
};

// ═══════════════════════════════════════════════════════════════
// ОБЩИЕ ХЕЛПЕРЫ
// ═══════════════════════════════════════════════════════════════
Pages.switchPatientTab = (tab, btn) => {
  document.querySelectorAll('[id^="patientTab-"]').forEach(el => el.style.display='none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById(`patientTab-${tab}`);
  if (target) target.style.display = '';
  if (btn) btn.classList.add('active');
};

Pages.savePatientNotes = async (id) => {
  const notes = document.getElementById('patientNotesArea')?.value;
  try {
    await api.updatePatient(id, { notes });
    UI.toast('Заметка сохранена', 'success');
  } catch(e) {
    UI.toast('Ошибка сохранения', 'error');
  }
};

Pages.uploadPatientFile = async (patientId) => {
  const input = document.getElementById('fileUploadInput');
  if (!input?.files?.length) return;
  for (const file of input.files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('file_type', /\.(dcm)$/i.test(file.name)?'xray':/\.(jpg|jpeg|png|gif)$/i.test(file.name)?'photo':'document');
    try {
      await api.upload(`/patients/${patientId}/files`, fd);
      UI.toast(`${file.name} загружен`, 'success');
    } catch(e) {
      UI.toast(`Ошибка: ${file.name}`, 'error');
    }
  }
  Pages.loadPatientDetail(document.getElementById('page-patient-detail'), { patientId });
};

Pages.showCreatePatientModal = () => {
  UI.showModal('Новый пациент', `
    <form id="createPatientForm" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">Фамилия *</label><input class="form-input" name="last_name" required /></div>
        <div class="form-group"><label class="form-label">Имя *</label><input class="form-input" name="first_name" required /></div>
        <div class="form-group"><label class="form-label">Отчество</label><input class="form-input" name="middle_name" /></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">Телефон *</label><input class="form-input" name="phone" type="tel" required placeholder="+996 XXX XXX XXX" /></div>
        <div class="form-group"><label class="form-label">Дата рождения</label><input class="form-input" name="date_of_birth" type="date" /></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" name="email" type="email" /></div>
        <div class="form-group"><label class="form-label">Пол</label>
          <select class="form-select" name="gender">
            <option value="">Не указан</option><option value="male">Мужской</option><option value="female">Женский</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label class="form-label">Адрес</label><input class="form-input" name="address" /></div>
      <div class="form-group"><label class="form-label" style="color:#ef4444">⚠️ Аллергии</label><textarea class="form-textarea" name="allergies" rows="2"></textarea></div>
      <div class="form-group"><label class="form-label" style="color:#d97706">🩺 Хронические заболевания</label><textarea class="form-textarea" name="chronic_diseases" rows="2"></textarea></div>
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
    } catch(err) { UI.toast(err.message, 'error'); }
  });
};

Pages.showEditPatientModal = async (id) => {
  try {
    const p = await api.patient(id);
    UI.showModal('Редактировать пациента', `
      <form id="editPatientForm" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div class="form-group"><label class="form-label">Фамилия *</label><input class="form-input" name="last_name" value="${p.last_name||''}" required /></div>
          <div class="form-group"><label class="form-label">Имя *</label><input class="form-input" name="first_name" value="${p.first_name||''}" required /></div>
          <div class="form-group"><label class="form-label">Отчество</label><input class="form-input" name="middle_name" value="${p.middle_name||''}" /></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group"><label class="form-label">Телефон *</label><input class="form-input" name="phone" value="${p.phone||''}" required /></div>
          <div class="form-group"><label class="form-label">Дата рождения</label><input class="form-input" name="date_of_birth" type="date" value="${p.date_of_birth?p.date_of_birth.split('T')[0]:''}" /></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-group"><label class="form-label">Email</label><input class="form-input" name="email" value="${p.email||''}" /></div>
          <div class="form-group"><label class="form-label">Адрес</label><input class="form-input" name="address" value="${p.address||''}" /></div>
        </div>
        <div class="form-group"><label class="form-label" style="color:#ef4444">⚠️ Аллергии</label><textarea class="form-textarea" name="allergies" rows="2">${p.allergies||''}</textarea></div>
        <div class="form-group"><label class="form-label" style="color:#d97706">🩺 Хронические заболевания</label><textarea class="form-textarea" name="chronic_diseases" rows="2">${p.chronic_diseases||''}</textarea></div>
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
      } catch(err) { UI.toast(err.message, 'error'); }
    });
  } catch(_) { UI.toast('Ошибка загрузки', 'error'); }
};
