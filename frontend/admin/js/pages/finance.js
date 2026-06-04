Pages.loadFinance = async (el) => {
  const isChief = App.user?.role === 'chief_doctor';
  if (!isChief) {
    el.innerHTML = UI.empty('🔒', 'Доступ запрещён', 'Финансовый раздел доступен только главному врачу');
    return;
  }

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Финансы и аналитика</h1></div>
      <div style="display:flex;gap:10px">
        <button class="btn-secondary btn-sm" onclick="Pages.exportFinanceExcel()">📊 Экспорт Excel</button>
        <button class="btn-primary btn-sm" onclick="Pages.showAddPaymentModal()">+ Платёж</button>
      </div>
    </div>
    <div id="financeContent">${UI.skeleton(3, 3)}</div>
  `;

  try {
    const data = await api.financeDashboard();
    renderFinance(data);
  } catch (e) {
    document.getElementById('financeContent').innerHTML = UI.empty('⚠️', 'Ошибка загрузки финансовых данных');
  }
};

function renderFinance(data) {
  const el = document.getElementById('financeContent');
  const today   = data.today   || {};
  const week    = data.week    || {};
  const monthly = data.monthlyChart || [];
  const top     = data.topServices  || [];
  const docs    = data.doctorStats  || [];

  // Build chart bars
  const revenues = monthly.map(m => parseFloat(m.revenue) || 0);
  const maxRev   = Math.max(...revenues, 1);
  const BAR_H    = 140;

  el.innerHTML = `
    <!-- KPI Cards -->
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card stat-card--green">
        <div class="stat-card__icon">💰</div>
        <div class="stat-card__label">Выручка сегодня</div>
        <div class="stat-card__value">${UI.fmtMoney(today.today_revenue || 0)}</div>
        <div class="stat-card__sub">${today.today_completed || 0} завершённых приёмов</div>
      </div>
      <div class="stat-card stat-card--blue">
        <div class="stat-card__icon">📈</div>
        <div class="stat-card__label">Выручка за неделю</div>
        <div class="stat-card__value">${UI.fmtMoney(week.revenue || 0)}</div>
        <div class="stat-card__sub">${week.payments || 0} платежей</div>
      </div>
      <div class="stat-card stat-card--amber">
        <div class="stat-card__icon">📅</div>
        <div class="stat-card__label">Выручка за месяц</div>
        <div class="stat-card__value">${UI.fmtMoney(revenues.reduce((a,b)=>a+b,0))}</div>
        <div class="stat-card__sub">${monthly.length} дней с платежами</div>
      </div>
      <div class="stat-card stat-card--purple">
        <div class="stat-card__icon">🦷</div>
        <div class="stat-card__label">Средний чек</div>
        <div class="stat-card__value">${revenues.length ? UI.fmtMoney(revenues.reduce((a,b)=>a+b,0) / Math.max(monthly.reduce((a,m)=>a+(parseInt(m.payment_count)||0),0),1)) : '0 сом'}</div>
        <div class="stat-card__sub">за этот месяц</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:20px">
      <!-- Monthly Chart -->
      <div class="card">
        <div class="card__header">
          <span class="card__title">Выручка по дням (текущий месяц)</span>
        </div>
        <div class="card__body">
          ${monthly.length ? `
            <div class="finance-bars" style="height:${BAR_H}px;align-items:flex-end;display:flex;gap:4px;padding:0 4px">
              ${monthly.map(m => {
                const h = Math.max(4, Math.round((parseFloat(m.revenue)/maxRev)*BAR_H));
                const day = new Date(m.day).getDate();
                return `
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:default" 
                       title="${UI.fmtDate(m.day)}: ${UI.fmtMoney(m.revenue)}">
                    <div style="width:100%;background:var(--c-primary);border-radius:3px 3px 0 0;height:${h}px;opacity:0.75;transition:opacity 0.2s" 
                         onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.75"></div>
                    <div style="font-size:9px;color:var(--text-3)">${day}</div>
                  </div>`;
              }).join('')}
            </div>
          ` : UI.empty('📊', 'Нет данных за этот месяц')}
        </div>
      </div>

      <!-- Top Services -->
      <div class="card">
        <div class="card__header"><span class="card__title">Топ услуги за месяц</span></div>
        <div class="card__body">
          ${top.length ? `
            <div style="display:flex;flex-direction:column;gap:12px">
              ${top.map((s, i) => {
                const pct = top[0]?.total > 0 ? Math.round((s.total / top[0].total) * 100) : 0;
                const colors = ['var(--c-primary)','var(--c-accent)','var(--c-warning)','var(--c-purple)','var(--c-danger)'];
                return `
                  <div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                      <span style="font-size:13px;font-weight:500">${i+1}. ${s.name}</span>
                      <span style="font-size:13px;color:var(--text-2)">${UI.fmtMoney(s.total)}</span>
                    </div>
                    <div style="background:var(--surface-3);border-radius:4px;height:6px">
                      <div style="width:${pct}%;background:${colors[i]};border-radius:4px;height:6px;transition:width 0.8s ease"></div>
                    </div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:3px">${s.count} услуг оказано</div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : UI.empty('📊', 'Нет данных')}
        </div>
      </div>
    </div>

    <!-- Doctor Stats -->
    <div class="card" style="margin-bottom:20px">
      <div class="card__header"><span class="card__title">Статистика по врачам (месяц)</span></div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Врач</th><th>Специализация</th><th>Приёмов</th><th>Выручка</th>
            <th>Доля</th>
          </tr></thead>
          <tbody>
            ${docs.map(d => {
              const totalRev = docs.reduce((a,b) => a + parseFloat(b.revenue||0), 0);
              const pct = totalRev > 0 ? Math.round(parseFloat(d.revenue)/totalRev*100) : 0;
              return `
                <tr>
                  <td style="font-weight:500">${d.doctor_name}</td>
                  <td style="color:var(--text-2)">${d.specialization}</td>
                  <td>${d.appointments}</td>
                  <td style="font-weight:600;color:var(--c-primary)">${UI.fmtMoney(d.revenue)}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="background:var(--surface-3);border-radius:3px;height:6px;width:80px;flex-shrink:0">
                        <div style="width:${pct}%;background:var(--c-accent);border-radius:3px;height:6px"></div>
                      </div>
                      <span style="font-size:12px;color:var(--text-3)">${pct}%</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Recent Payments -->
    <div class="card">
      <div class="card__header">
        <span class="card__title">Последние платежи</span>
        <div style="display:flex;gap:8px">
          <input type="date" class="form-input" id="payFromDate" style="width:140px" />
          <input type="date" class="form-input" id="payToDate" style="width:140px" />
          <button class="btn-secondary btn-sm" onclick="Pages.loadPaymentsTable()">Фильтр</button>
        </div>
      </div>
      <div class="card__body" id="paymentsTable">${UI.skeleton(5, 4)}</div>
    </div>
  `;

  Pages.loadPaymentsTable();
}

Pages.loadPaymentsTable = async () => {
  const from = document.getElementById('payFromDate')?.value || '';
  const to   = document.getElementById('payToDate')?.value   || '';
  let params = '?limit=30';
  if (from) params += `&from=${from}`;
  if (to)   params += `&to=${to}`;

  const tbl = document.getElementById('paymentsTable');
  if (!tbl) return;
  tbl.innerHTML = UI.skeleton(5, 4);

  try {
    const rows = await api.payments(params);
    if (!rows?.length) { tbl.innerHTML = UI.empty('💳', 'Платежей не найдено'); return; }

    const methodLabels = { cash: '💵 Наличные', card: '💳 Карта', transfer: '🏦 Перевод' };
    const statusBadge  = { paid: 'badge--confirmed', pending: 'badge--pending', refunded: 'badge--cancelled' };
    const statusLabel  = { paid: 'Оплачено', pending: 'Ожидает', refunded: 'Возврат' };

    tbl.innerHTML = `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Дата</th><th>Пациент</th><th>Сумма</th>
            <th>Способ оплаты</th><th>Принял</th><th>Статус</th>
          </tr></thead>
          <tbody>
            ${rows.map(p => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:12px">${UI.fmtDateTime(p.paid_at)}</td>
                <td style="font-weight:500">${p.patient_name}</td>
                <td style="font-weight:700;color:var(--c-accent)">${UI.fmtMoney(p.amount)}</td>
                <td style="color:var(--text-2)">${methodLabels[p.payment_method] || p.payment_method}</td>
                <td style="color:var(--text-3)">${p.received_by_name || '—'}</td>
                <td><span class="badge ${statusBadge[p.status]}">${statusLabel[p.status]}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    tbl.innerHTML = UI.empty('⚠️', 'Ошибка загрузки платежей');
  }
};

Pages.showAddPaymentModal = async () => {
  UI.showModal('Добавить платёж', `
    <form id="addPaymentForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label class="form-label">Пациент (поиск по телефону)</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="payPhone" placeholder="+996..." style="flex:1" />
          <button type="button" class="btn-secondary" onclick="Pages.lookupPaymentPatient()">Найти</button>
        </div>
        <div id="payPatientName" style="font-size:12px;color:var(--c-accent);margin-top:4px"></div>
      </div>
      <input type="hidden" id="payPatientId" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Сумма (сом) *</label>
          <input class="form-input" id="payAmount" type="number" min="1" required />
        </div>
        <div class="form-group">
          <label class="form-label">Способ оплаты</label>
          <select class="form-select" id="payMethod">
            <option value="cash">💵 Наличные</option>
            <option value="card">💳 Карта</option>
            <option value="transfer">🏦 Перевод</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Примечание</label>
        <textarea class="form-textarea" id="payNotes" rows="2"></textarea>
      </div>
      <button type="submit" class="btn-primary">Зафиксировать платёж</button>
    </form>
  `);

  document.getElementById('addPaymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = document.getElementById('payPatientId').value;
    const amount    = document.getElementById('payAmount').value;
    const method    = document.getElementById('payMethod').value;
    const notes     = document.getElementById('payNotes').value;
    if (!patientId) { UI.toast('Найдите пациента', 'error'); return; }
    try {
      await api.createPayment({ patient_id: patientId, amount, payment_method: method, notes });
      UI.closeModal();
      UI.toast('Платёж зафиксирован', 'success');
      Pages.loadFinance(document.getElementById('page-finance'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.lookupPaymentPatient = async () => {
  const phone = document.getElementById('payPhone').value;
  if (!phone) return;
  try {
    const res = await api.patients(`?search=${encodeURIComponent(phone)}&limit=1`);
    const p = res?.data?.[0];
    if (p) {
      document.getElementById('payPatientId').value = p.id;
      document.getElementById('payPatientName').textContent = `✓ ${p.last_name} ${p.first_name}`;
    } else {
      document.getElementById('payPatientName').textContent = '✗ Пациент не найден';
      document.getElementById('payPatientName').style.color = 'var(--c-danger)';
    }
  } catch (_) {}
};

Pages.exportFinanceExcel = () => {
  const from = document.getElementById('payFromDate')?.value || '';
  const to   = document.getElementById('payToDate')?.value   || '';
  const token = api.getToken();
  let url = '/api/finance/export/excel?';
  if (from) url += `from=${from}&`;
  if (to)   url += `to=${to}`;
  // Open in new tab with auth header via fetch
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `finance_${from||'all'}.xlsx`;
      a.click();
    })
    .catch(() => UI.toast('Ошибка экспорта', 'error'));
};
