Pages.loadInventory = async (el) => {
  const isChief = App.user?.role === 'chief_doctor';
  const isAdmin = App.user?.role === 'admin';

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Склад и материалы</h1></div>
      ${isChief ? `<button class="btn-primary" onclick="Pages.showAddItemModal()">+ Добавить товар</button>` : ''}
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="invSearch" placeholder="Поиск на складе..." />
      </div>
      <button class="btn-secondary btn-sm" onclick="Pages.showInventoryLogs()">📜 История операций</button>
    </div>
    <div class="card">
      <div class="card__body" id="inventoryTable">${UI.skeleton(5, 5)}</div>
    </div>
  `;

  const load = async () => {
    const search = document.getElementById('invSearch')?.value || '';
    try {
      const items = await api.get(`/inventory?search=${encodeURIComponent(search)}`);
      renderInventory(items, isChief || isAdmin);
    } catch (e) {
      document.getElementById('inventoryTable').innerHTML = UI.empty('⚠️', 'Ошибка загрузки склада');
    }
  };

  document.getElementById('invSearch').addEventListener('input', UI.debounce(load, 300));
  await load();
};

function renderInventory(items, canEdit) {
  const el = document.getElementById('inventoryTable');
  if (!items.length) {
    el.innerHTML = UI.empty('📦', 'На складе пусто');
    return;
  }

  el.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Наименование</th>
          <th>Категория</th>
          <th>Остаток</th>
          <th>Цена ед.</th>
          <th style="text-align:right">Действия</th>
        </tr></thead>
        <tbody>
          ${items.map(item => {
            const isLow = parseFloat(item.quantity) <= parseFloat(item.min_quantity);
            return `
              <tr>
                <td>
                  <div style="font-weight:600">${item.name}</div>
                  ${isLow ? `<div style="font-size:10px;color:var(--c-danger);font-weight:700">⚠️ МАЛО НА СКЛАДЕ</div>` : ''}
                </td>
                <td style="color:var(--text-3)">${item.category || '—'}</td>
                <td>
                  <span style="font-weight:700; ${isLow ? 'color:var(--c-danger)' : ''}">
                    ${item.quantity} ${item.unit}
                  </span>
                </td>
                <td style="color:var(--text-2)">${UI.fmtMoney(item.price_per_unit)}</td>
                <td style="text-align:right">
                  <div class="actions">
                    <button class="btn-icon" title="Приход" style="color:var(--c-success)" onclick="Pages.showInvTransaction('${item.id}', 'in', '${item.name}')">➕</button>
                    <button class="btn-icon" title="Списание" style="color:var(--c-danger)" onclick="Pages.showInvTransaction('${item.id}', 'out', '${item.name}')">➖</button>
                    ${canEdit ? `<button class="btn-icon" title="Правка" onclick="Pages.showEditItemModal('${item.id}')">✏️</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

Pages.showAddItemModal = () => {
  UI.showModal('Добавить на склад', `
    <form id="addItemForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label class="form-label">Наименование *</label>
        <input class="form-input" name="name" required placeholder="Анестетик Ультракаин" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Категория</label>
          <input class="form-input" name="category" placeholder="Расходники" />
        </div>
        <div class="form-group">
          <label class="form-label">Ед. измерения</label>
          <input class="form-input" name="unit" value="шт" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Мин. остаток</label>
          <input class="form-input" name="min_quantity" type="number" step="0.01" value="5" />
        </div>
        <div class="form-group">
          <label class="form-label">Цена за ед.</label>
          <input class="form-input" name="price_per_unit" type="number" step="0.01" value="0" />
        </div>
      </div>
      <button type="submit" class="btn-primary">Добавить</button>
    </form>
  `);

  document.getElementById('addItemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api.post('/inventory', body);
      UI.closeModal();
      UI.toast('Товар добавлен', 'success');
      Pages.loadInventory(document.getElementById('page-inventory'));
    } catch (err) { UI.toast(err.message, 'error'); }
  });
};

Pages.showInvTransaction = (id, type, name) => {
  UI.showModal(type === 'in' ? `Приход: ${name}` : `Списание: ${name}`, `
    <form id="invTransForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label class="form-label">Количество *</label>
        <input class="form-input" name="quantity" type="number" step="0.01" required />
      </div>
      <div class="form-group">
        <label class="form-label">Причина / Комментарий</label>
        <input class="form-input" name="reason" placeholder="${type === 'in' ? 'Закупка' : 'Лечение пациента'}" />
      </div>
      <button type="submit" class="btn-primary">${type === 'in' ? 'Принять' : 'Списать'}</button>
    </form>
  `);

  document.getElementById('invTransForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.item_id = id;
    body.type = type;
    try {
      await api.post('/inventory/transaction', body);
      UI.closeModal();
      UI.toast('Операция выполнена', 'success');
      Pages.loadInventory(document.getElementById('page-inventory'));
    } catch (err) { UI.toast(err.message, 'error'); }
  });
};

Pages.showInventoryLogs = async () => {
  UI.showModal('История операций', `<div id="invLogsContent">${UI.pageLoader()}</div>`);
  try {
    const logs = await api.get('/inventory/logs');
    document.getElementById('invLogsContent').innerHTML = `
      <div class="data-table-wrap" style="max-height:400px;overflow-y:auto">
        <table class="data-table">
          <thead><tr><th>Товар</th><th>Тип</th><th>Кол-во</th><th>Причина</th><th>Дата</th></tr></thead>
          <tbody>
            ${logs.map(l => `
              <tr>
                <td>${l.item_name}</td>
                <td><span class="badge badge--${l.type === 'in' ? 'confirmed' : 'cancelled'}">${l.type === 'in' ? '➕' : '➖'}</span></td>
                <td style="font-weight:700">${l.quantity}</td>
                <td style="font-size:12px">${l.reason || '—'}</td>
                <td style="font-size:11px;color:var(--text-3)">${UI.fmtDateTime(l.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    document.getElementById('invLogsContent').innerHTML = UI.empty('⚠️', 'Ошибка');
  }
};
