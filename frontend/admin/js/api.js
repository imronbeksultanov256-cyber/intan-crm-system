// ── API CLIENT ─────────────────────────────────────────────
const API_BASE = 'https://intan-backend.onrender.com/api';

const api = {

  getToken() {
    return localStorage.getItem('access_token') || null;
  },

  setToken(token) {
    if (token) localStorage.setItem('access_token', token);
    else       localStorage.removeItem('access_token');
  },

  async request(method, path, body = null, opts = {}) {
    const url = `${API_BASE}${path}`;
    console.log(`[API] ${method} ${url}`);

    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body instanceof FormData) {
      delete headers['Content-Type'];
      config.body = body;
    } else if (body !== null) {
      config.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(url, config);
      console.log(`[API] ← ${res.status} ${url}`);
    } catch (netErr) {
      console.error('[API] Сеть:', netErr.message);
      throw new Error('Нет связи с сервером. Проверьте интернет.');
    }

    // 429 — rate limit
    if (res.status === 429) {
      throw new Error('Слишком много запросов. Подождите минуту.');
    }

    // 401 — только НЕ для логина и НЕ для refresh
    if (res.status === 401 && !opts.noRefresh && path !== '/auth/login') {
      this.setToken(null);
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (typeof App !== 'undefined') App.showAuth();
      return null;
    }

    // Любая ошибка — бросаем с текстом от сервера
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body.error || body.message || msg;
      } catch (_) {}
      throw new Error(msg);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res;
  },

  // ── Shortcuts ────────────────────────────────────────────
  get:    (path)       => api.request('GET',    path),
  post:   (path, body, opts) => api.request('POST',   path, body, opts),
  put:    (path, body) => api.request('PUT',    path, body),
  patch:  (path, body) => api.request('PATCH',  path, body),
  del:    (path)       => api.request('DELETE', path),
  upload: (path, fd)   => api.request('POST',   path, fd),

  // ── Auth ─────────────────────────────────────────────────
  login:  (email, password) => api.post('/auth/login', { email, password }),
  me:     ()                => api.get('/auth/me'),
  logout: ()                => api.post('/auth/logout', null, { noRefresh: true }),

  // ── Dashboard ────────────────────────────────────────────
  dashboard: () => api.get('/dashboard'),

  // ── Patients ─────────────────────────────────────────────
  patients:      (p = '') => api.get(`/patients${p}`),
  patient:       (id)     => api.get(`/patients/${id}`),
  createPatient: (body)   => api.post('/patients', body),
  updatePatient: (id, b)  => api.put(`/patients/${id}`, b),

  // ── Appointments ─────────────────────────────────────────
  appointments:     (p = '') => api.get(`/appointments${p}`),
  createAppt:       (body)   => api.post('/appointments', body),
  updateApptStatus: (id, s)  => api.patch(`/appointments/${id}/status`, { status: s }),
  slots: (dId, date)         => api.get(`/appointments/slots?doctorId=${dId}&date=${date}`),

  // ── Services ─────────────────────────────────────────────
  services:      (p = '') => api.get(`/services${p}`),
  createService: (body)   => api.post('/services', body),
  updateService: (id, b)  => api.put(`/services/${id}`, b),
  deleteService: (id)     => api.del(`/services/${id}`),

  // ── Finance ──────────────────────────────────────────────
  financeDashboard: ()       => api.get('/finance/dashboard'),
  payments:         (p = '') => api.get(`/finance/payments${p}`),
  createPayment:    (body)   => api.post('/finance/payments', body),

  // ── Doctors ──────────────────────────────────────────────
  doctors: ()   => api.get('/doctors'),
  doctor:  (id) => api.get(`/doctors/${id}`),

  // ── Users ────────────────────────────────────────────────
  users:      ()     => api.get('/users'),
  createUser: (body) => api.post('/users', body),

  // ── Logs ─────────────────────────────────────────────────
  logs: () => api.get('/logs'),
};