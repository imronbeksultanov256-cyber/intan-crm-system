Pages.loadServices = async (el) => {
  const isChief = App.user?.role === 'chief_doctor';

  el.innerHTML = `
    <div class="page-header">
      <div><h1>Прайс-лист услуг</h1></div>
      <div style="display:flex;gap:10px">
        <button class="btn-secondary btn-sm" onclick="Pages.exportServicesExcel()">
          📊 Excel
        </button>
        <button class="btn-secondary btn-sm" onclick="Pages.exportServicesPdf()">
          📄 Экспорт PDF
        </button>
        <button class="btn-primary" onclick="Pages.showAddServiceModal()">+ Добавить услугу</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="serviceSearch" placeholder="Поиск процедуры..." />
      </div>
      <select class="form-select" id="serviceCategoryFilter" style="width:200px">
        <option value="">Все категории</option>
        <option value="therapy">Терапия</option>
        <option value="surgery">Хирургия</option>
        <option value="implantation">Имплантация</option>
        <option value="orthodontics">Ортодонтия</option>
        <option value="pediatric">Детская стоматология</option>
        <option value="whitening">Отбеливание</option>
        <option value="prosthetics">Протезирование</option>
      </select>
    </div>
    <div id="servicesContent">${UI.skeleton(4, 4)}</div>
  `;

  const load = async () => {
    const search   = document.getElementById('serviceSearch')?.value || '';
    const category = document.getElementById('serviceCategoryFilter')?.value || '';
    let params = '?activeOnly=true';
    if (search)   params += `&search=${encodeURIComponent(search)}`;
    if (category) params += `&category=${category}`;

    try {
      const res = await api.services(params);
      renderServices(res.grouped || [], isChief);
    } catch (e) {
      document.getElementById('servicesContent').innerHTML = UI.empty('⚠️', 'Ошибка загрузки прайс-листа');
    }
  };

  document.getElementById('serviceSearch').addEventListener('input', UI.debounce(load, 300));
  document.getElementById('serviceCategoryFilter').addEventListener('change', load);
  await load();
};

function renderServices(grouped, isChief) {
  const el = document.getElementById('servicesContent');
  if (!grouped.length) {
    el.innerHTML = UI.empty('💲', 'Процедуры не найдены');
    return;
  }

  el.innerHTML = grouped.map(cat => `
    <div class="card" style="margin-bottom:16px">
      <div class="card__header" style="padding:16px 20px">
        <span class="card__title">${cat.name}</span>
        <span style="font-size:12px;color:var(--text-3)">${cat.services.length} процедур</span>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Название процедуры</th>
            <th>Длительность</th>
            <th style="text-align:right">Цена</th>
            ${isChief ? '<th style="text-align:right">Действия</th>' : ''}
          </tr></thead>
          <tbody>
            ${cat.services.map(s => `
              <tr>
                <td>
                  <div style="font-weight:500">${s.name}</div>
                  ${s.description ? `<div style="font-size:12px;color:var(--text-3);margin-top:2px">${s.description}</div>` : ''}
                </td>
                <td style="color:var(--text-3)">${s.duration_min} мин</td>
                <td style="text-align:right;font-weight:600;color:var(--c-primary)">
                  ${UI.fmtMoney(s.price)}
                </td>
                ${isChief ? `
                  <td>
                    <div class="actions">
                      <button class="btn-icon" title="Редактировать" onclick="Pages.showEditServiceModal('${s.id}','${s.name.replace(/'/g,"\\'")}',${s.price},${s.duration_min},'${s.description||''}',${s.category_id})">✏️</button>
                      <button class="btn-icon" title="Удалить" style="color:var(--c-danger)" onclick="Pages.deleteService('${s.id}')">🗑</button>
                    </div>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

Pages.showAddServiceModal = async () => {
  const cats = await getCategoryOptions();
  UI.showModal('Добавить процедуру', `
    <form id="addServiceForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label class="form-label">Категория *</label>
        <select class="form-select" name="category_id" required>${cats}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Название процедуры *</label>
        <input class="form-input" name="name" required placeholder="Пломбирование зуба" />
      </div>
      <div class="form-group">
        <label class="form-label">Описание</label>
        <textarea class="form-textarea" name="description" rows="2"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Цена (сом) *</label>
          <input class="form-input" name="price" type="number" min="0" step="50" required />
        </div>
        <div class="form-group">
          <label class="form-label">Длительность (мин)</label>
          <input class="form-input" name="duration_min" type="number" min="10" value="60" />
        </div>
      </div>
      <button type="submit" class="btn-primary">Добавить</button>
    </form>
  `);

  document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api.createService(body);
      UI.closeModal();
      UI.toast('Процедура добавлена', 'success');
      Pages.loadServices(document.getElementById('page-services'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.showEditServiceModal = (id, name, price, duration, description, categoryId) => {
  UI.showModal('Редактировать процедуру', `
    <form id="editServiceForm" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label class="form-label">Название процедуры *</label>
        <input class="form-input" name="name" value="${name}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Описание</label>
        <textarea class="form-textarea" name="description" rows="2">${description}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label">Цена (сом) *</label>
          <input class="form-input" name="price" type="number" min="0" step="50" value="${price}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Длительность (мин)</label>
          <input class="form-input" name="duration_min" type="number" min="10" value="${duration}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Статус</label>
        <select class="form-select" name="is_active">
          <option value="true">Активна</option>
          <option value="false">Скрыта</option>
        </select>
      </div>
      <button type="submit" class="btn-primary">Сохранить изменения</button>
    </form>
  `);

  document.getElementById('editServiceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.is_active = body.is_active === 'true';
    try {
      await api.updateService(id, body);
      UI.closeModal();
      UI.toast('Процедура обновлена', 'success');
      Pages.loadServices(document.getElementById('page-services'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
};

Pages.exportServicesPdf = async () => {
  const token = api.getToken();
  const url = `${api.baseUrl}/services/export/pdf`;

  UI.toast('Формируется прайс-лист...', 'info');

  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error();
    const data = await r.json();

    if (!window.jsPDF) {
      await new Promise((resolve, reject) => {
        const s1 = document.createElement('script');
        s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s1.onload = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
          s2.onload = resolve; s2.onerror = reject;
          document.head.appendChild(s2);
        };
        s1.onerror = reject;
        document.head.appendChild(s1);
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Header
    doc.setFontSize(16);
    doc.setTextColor(27, 79, 114);
    doc.text('Стоматологическая клиника «Интан»', 105, 16, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text('Прайс-лист услуг', 105, 23, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text(`Дата: ${new Date().toLocaleDateString('ru-RU')}`, 105, 29, { align: 'center' });

    // Group by category
    const grouped = {};
    data.services.forEach(s => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });

    const tableRows = [];
    Object.entries(grouped).forEach(([cat, services]) => {
      tableRows.push([{ content: cat, colSpan: 3, styles: { fillColor: [27, 108, 168], textColor: 255, fontStyle: 'bold', fontSize: 10 } }]);
      services.forEach((s, i) => {
        tableRows.push([
          s.name,
          `${s.duration_min} мин`,
          `${parseFloat(s.price).toLocaleString('ru-RU')} сом`
        ]);
      });
    });

    doc.autoTable({
      startY: 34,
      head: [['Наименование процедуры', 'Длительность', 'Стоимость']],
      body: tableRows,
      headStyles: { fillColor: [27, 108, 168], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 252, 255] },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'right', fontStyle: 'bold', textColor: [27, 108, 168], cellWidth: 35 }
      },
      styles: { fontSize: 9, cellPadding: 2.5 },
      margin: { left: 10, right: 10 },
      didDrawPage: (d) => {
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Страница ${d.pageNumber}`, 105, doc.internal.pageSize.height - 6, { align: 'center' });
      }
    });

    doc.save('price_list.pdf');
    UI.toast('Прайс-лист сохранён', 'success');
  } catch (e) {
    UI.toast('Ошибка создания PDF', 'error');
  }
};

Pages.deleteService = async (id) => {
  if (!UI.confirm('Деактивировать эту процедуру?')) return;
  try {
    await api.deleteService(id);
    UI.toast('Процедура деактивирована', 'success');
    Pages.loadServices(document.getElementById('page-services'));
  } catch (e) {
    UI.toast(e.message, 'error');
  }
};

Pages.exportServicesExcel = async () => {
  const token = api.getToken();
  const url = `${api.baseUrl}/services/export/pdf`;

  UI.toast('Формируется Excel...', 'info');
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error();
    const data = await r.json();

    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const wb = XLSX.utils.book_new();
    const rows = [['Категория', 'Процедура', 'Длительность (мин)', 'Цена (сом)']];
    const grouped = {};
    data.services.forEach(s => {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    });
    Object.entries(grouped).forEach(([cat, services]) => {
      services.forEach(s => rows.push([cat, s.name, s.duration_min, parseFloat(s.price)]));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Прайс-лист');
    XLSX.writeFile(wb, 'price_list.xlsx');
    UI.toast('Excel сохранён', 'success');
  } catch (e) {
    UI.toast('Ошибка экспорта', 'error');
  }
};

async function getCategoryOptions() {
  const cats = [
    { id: 1, name: 'Терапия' }, { id: 2, name: 'Хирургия' },
    { id: 3, name: 'Имплантация' }, { id: 4, name: 'Ортодонтия' },
    { id: 5, name: 'Детская стоматология' }, { id: 6, name: 'Отбеливание' },
    { id: 7, name: 'Протезирование' },
  ];
  return cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}
