// ═══════════════════════════════════════════════════════════════
// DOCTORS — управление персоналом v2.0
// ═══════════════════════════════════════════════════════════════

Pages.loadDoctors = async (el) => {
  const isChief = App.user?.role === 'chief_doctor';

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Врачи и персонал</h1></div>
    </div>
    <div id="doctorsList" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
      ${UI.pageLoader()}
    </div>
  `;

  try {
    const doctors = await api.doctors();
    renderDoctors(doctors);
  } catch (e) {
    document.getElementById('doctorsList').innerHTML = UI.empty('⚠️','Ошибка загрузки');
  }

  function renderDoctors(docs) {
    const list = document.getElementById('doctorsList');
    if (!docs?.length) {
      list.innerHTML = UI.empty('👨‍⚕️','Список пуст');
      return;
    }
    list.innerHTML = docs.map(d => `
      <div class="card doctor-card" style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <div style="display:flex;gap:14px;align-items:center">
          <div style="width:64px;height:64px;border-radius:12px;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden">
            ${d.photo_url ? `<img src="${d.photo_url}" style="width:100%;height:100%;object-fit:cover">` : UI.initials(`${d.last_name} ${d.first_name}`)}
          </div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:15px">${d.last_name} ${d.first_name}</div>
            <div style="font-size:12px;color:var(--c-primary);font-weight:600">${d.specialization}</div>
            <div style="font-size:12px;color:var(--text-3)">Стаж: ${d.experience_years} лет</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
          <div style="padding:8px;background:var(--surface-2);border-radius:8px;text-align:center">
             <div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Рейтинг</div>
             <div style="font-weight:700;font-size:14px;color:var(--c-warning)">⭐ ${d.rating||'0.0'}</div>
          </div>
          <div style="padding:8px;background:var(--surface-2);border-radius:8px;text-align:center">
             <div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Кабинет</div>
             <div style="font-weight:700;font-size:14px">${d.cabinet||'—'}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="btn-primary btn-sm" style="flex:1" onclick="Pages.showDoctorDetail('${d.id}')">Профиль</button>
          ${isChief ? `<button class="btn-secondary btn-sm" onclick="Pages.editDoctor('${d.id}')">✏️</button>` : ''}
        </div>
      </div>
    `).join('');
  }
};

Pages.showDoctorDetail = async (id) => {
  UI.showModal('Карточка врача', `<div id="docDetailContent">${UI.pageLoader()}</div>`);
  try {
    const d = await api.doctor(id);
    const stats = await api.getDoctorStats(id);
    
    document.getElementById('docDetailContent').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;gap:16px;align-items:flex-start">
           <div style="width:80px;height:80px;border-radius:16px;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;flex-shrink:0">
            ${d.photo_url ? `<img src="${d.photo_url}" style="width:100%;height:100%;object-fit:cover">` : UI.initials(`${d.last_name} ${d.first_name}`)}
          </div>
          <div>
            <h2 style="font-size:1.2rem;margin-bottom:4px">${d.last_name} ${d.first_name} ${d.middle_name||''}</h2>
            <div style="color:var(--c-primary);font-weight:600;margin-bottom:8px">${d.specialization}</div>
            <div style="display:flex;gap:12px;font-size:13px;color:var(--text-2)">
              <span>📞 ${d.phone||'—'}</span>
              <span>✉️ ${d.email||'—'}</span>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
           <div class="card" style="padding:12px;text-align:center;background:var(--surface-2)">
              <div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Пациентов</div>
              <div style="font-size:1.2rem;font-weight:800;color:var(--c-primary)">${stats?.summary?.unique_patients || 0}</div>
           </div>
           <div class="card" style="padding:12px;text-align:center;background:var(--surface-2)">
              <div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Приёмов</div>
              <div style="font-size:1.2rem;font-weight:800;color:var(--c-success)">${stats?.summary?.total_completed || 0}</div>
           </div>
           <div class="card" style="padding:12px;text-align:center;background:var(--surface-2)">
              <div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Выручка</div>
              <div style="font-size:1.2rem;font-weight:800;color:var(--c-primary)">${UI.fmtMoney(stats?.summary?.total_revenue || 0)}</div>
           </div>
        </div>

        <div>
          <h3 style="font-size:14px;margin-bottom:8px">О враче</h3>
          <div style="font-size:13px;line-height:1.5;color:var(--text-2)">${d.bio || 'Информация не заполнена'}</div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <h3 style="font-size:14px;margin:0">График работы</h3>
            ${isChief ? `<button class="btn-secondary btn-sm" onclick="Pages.editDoctorSchedule('${d.id}')">✏️ Изменить</button>` : ''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));gap:8px">
            ${[1,2,3,4,5,6,7].map(day => {
              const s = d.schedule.find(x => x.day_of_week === day);
              const days = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
              return `
                <div style="padding:8px;border-radius:8px;border:1px solid var(--border);text-align:center;${s?.is_working ? '' : 'opacity:0.5;background:var(--surface-2)'}">
                  <div style="font-size:11px;font-weight:700">${days[day]}</div>
                  <div style="font-size:12px">${s?.is_working ? `${s.start_time.slice(0,5)}-${s.end_time.slice(0,5)}` : 'Вых'}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    document.getElementById('docDetailContent').innerHTML = UI.empty('⚠️','Ошибка данных');
  }
};

Pages.editDoctor = async (id) => {
  UI.showModal('Редактировать врача', `<div id="editDocContent">${UI.pageLoader()}</div>`);
  try {
    const d = await api.doctor(id);
    document.getElementById('editDocContent').innerHTML = `
      <form id="editDocForm" style="display:flex;flex-direction:column;gap:12px">
        <div class="form-group">
          <label class="form-label">Специализация</label>
          <input class="form-input" name="specialization" value="${d.specialization}" required />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label class="form-label">Стаж (лет)</label>
            <input class="form-input" type="number" name="experience_years" value="${d.experience_years}" />
          </div>
          <div class="form-group">
            <label class="form-label">Кабинет</label>
            <input class="form-input" name="cabinet" value="${d.cabinet||''}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Био / Описание</label>
          <textarea class="form-textarea" name="bio" rows="4">${d.bio||''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Фото URL</label>
          <input class="form-input" name="photo_url" value="${d.photo_url||''}" />
        </div>
        <button type="submit" class="btn-primary">Сохранить изменения</button>
      </form>
    `;

    document.getElementById('editDocForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      try {
        await api.updateDoctor(id, data);
        UI.toast('Профиль обновлен', 'success');
        UI.closeModal();
        Pages.loadDoctors(document.getElementById('page-doctors'));
      } catch (e) {
        UI.toast(e.message, 'error');
      }
    });
  } catch (e) {
    document.getElementById('editDocContent').innerHTML = UI.empty('⚠️','Ошибка');
  }
};

Pages.editDoctorSchedule = async (id) => {
  UI.showModal('Изменить график', `<div id="editScheduleContent">${UI.pageLoader()}</div>`);
  try {
    const d = await api.doctor(id);
    const days = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    
    document.getElementById('editScheduleContent').innerHTML = `
      <form id="scheduleForm" style="display:flex;flex-direction:column;gap:12px">
        ${[1,2,3,4,5,6,7].map(day => {
          const s = d.schedule.find(x => x.day_of_week === day);
          return `
            <div style="display:grid;grid-template-columns:120px 1fr 1fr 40px;gap:8px;align-items:center;padding:8px;border-bottom:1px solid var(--border)">
              <div style="font-size:13px;font-weight:600">${days[day]}</div>
              <input type="time" class="form-input" name="start_${day}" value="${s?.start_time || '09:00'}" ${s?.is_working === false ? 'disabled' : ''} />
              <input type="time" class="form-input" name="end_${day}" value="${s?.end_time || '18:00'}" ${s?.is_working === false ? 'disabled' : ''} />
              <input type="checkbox" name="work_${day}" ${s?.is_working !== false ? 'checked' : ''} onchange="this.parentElement.querySelectorAll('input[type=time]').forEach(i=>i.disabled=!this.checked)" />
            </div>
          `;
        }).join('')}
        <button type="submit" class="btn-primary" style="margin-top:10px">💾 Сохранить график</button>
      </form>
    `;

    document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const schedule = [];
      for (let day = 1; day <= 7; day++) {
        schedule.push({
          day_of_week: day,
          start_time: fd.get(`start_${day}`),
          end_time: fd.get(`end_${day}`),
          is_working: fd.get(`work_${day}`) === 'on'
        });
      }
      try {
        await api.updateDoctorSchedule(id, { schedule });
        UI.toast('График обновлен', 'success');
        UI.closeModal();
        Pages.showDoctorDetail(id);
      } catch (e) {
        UI.toast(e.message, 'error');
      }
    });
  } catch (e) {
    document.getElementById('editScheduleContent').innerHTML = UI.empty('⚠️','Ошибка');
  }
};
