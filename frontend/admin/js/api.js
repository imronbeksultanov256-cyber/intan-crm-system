// ── API CLIENT v2 ──────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : 'https://intan-backend.onrender.com/api';

const api = {
  baseUrl: API_BASE,

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

    if (res.status === 429) throw new Error('Слишком много запросов. Подождите минуту.');

    if (res.status === 401 && !opts.noRefresh && path !== '/auth/login') {
      this.setToken(null);
      localStorage.removeItem('refresh_token');
      if (typeof App !== 'undefined') App.showAuth();
      return null;
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      let details = null;
      try {
        const b = await res.json();
        msg = b.error || b.message || msg;
        details = b.details || null;
      } catch (_) {}
      const err = new Error(msg);
      err.details = details;
      throw err;
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res;
  },

  // ── Shortcuts ─────────────────────────────────────────────
  get:    (path)             => api.request('GET',    path),
  post:   (path, body, opts) => api.request('POST',   path, body, opts),
  put:    (path, body)       => api.request('PUT',    path, body),
  patch:  (path, body)       => api.request('PATCH',  path, body),
  del:    (path, body)       => api.request('DELETE', path, body),
  upload: (path, fd)         => api.request('POST',   path, fd),

  // ── Auth ──────────────────────────────────────────────────
  login:  (email, password) => api.post('/auth/login', { email, password }),
  me:     ()                => api.get('/auth/me'),
  logout: ()                => api.post('/auth/logout', null, { noRefresh: true }),

  // ── Dashboard ─────────────────────────────────────────────
  dashboard: () => api.get('/dashboard'),
  counters:  () => api.get('/counters'),

  // ── Patients ──────────────────────────────────────────────
  patients:      (p = '')       => api.get(`/patients${p}`),
  patient:       (id)           => api.get(`/patients/${id}`),
  createPatient: (body)         => api.post('/patients', body),
  updatePatient: (id, body)     => api.put(`/patients/${id}`, body),
  deletePatient: (id, body)     => api.del(`/patients/${id}`, body),
  permanentDelete:(id, body)     => api.del(`/patients/${id}/permanent`, body),
  restorePatient:(id)           => api.post(`/patients/${id}/restore`),

  // ── Анамнез ───────────────────────────────────────────────
  getAnamnesis:  (patientId)    => api.get(`/patients/${patientId}/anamnesis`),
  saveAnamnesis: (patientId, b) => api.put(`/patients/${patientId}/anamnesis`, b),

  // ── Зубная формула ────────────────────────────────────────
  getDentalChart:   (patientId)        => api.get(`/patients/${patientId}/dental-chart`),
  updateTooth:      (patientId, body)  => api.put(`/patients/${patientId}/dental-chart`, body),
  getToothHistory:  (patientId, tooth) => api.get(`/patients/${patientId}/tooth/${tooth}/history`),

  // ── Планы лечения ─────────────────────────────────────────
  getTreatmentPlans:  (patientId)          => api.get(`/patients/${patientId}/treatment-plans`),
  createTreatmentPlan:(patientId, body)    => api.post(`/patients/${patientId}/treatment-plan`, body),
  completePlanItem:   (patientId, planId, itemId) =>
    api.patch(`/patients/${patientId}/treatment-plan/${planId}/item/${itemId}`,
              { status: 'completed', completed_date: new Date().toISOString().split('T')[0] }),

  // ── История лечения ───────────────────────────────────────
  createTreatmentRecord: (body) => api.post('/treatments', body),
  getTreatmentRecord:    (id)   => api.get(`/treatments/${id}`),

  // ── Файлы ─────────────────────────────────────────────────
  uploadFile: (patientId, fd) => api.upload(`/patients/${patientId}/files`, fd),

  // ── Appointments ──────────────────────────────────────────
  appointments:     (p = '') => api.get(`/appointments${p}`),
  createAppt:       (body)   => api.post('/appointments', body),
  updateApptStatus: (id, s)  => api.patch(`/appointments/${id}/status`, { status: s }),
  slots: (dId, date)         => api.get(`/appointments/slots?doctorId=${dId}&date=${date}`),

  // ── Services ──────────────────────────────────────────────
  services:      (p = '') => api.get(`/services${p}`),
  createService: (body)   => api.post('/services', body),
  updateService: (id, b)  => api.put(`/services/${id}`, b),
  deleteService: (id)     => api.del(`/services/${id}`),

  // ── Finance ───────────────────────────────────────────────
  financeDashboard: ()       => api.get('/finance/dashboard'),
  payments:         (p = '') => api.get(`/finance/payments${p}`),
  createPayment:    (body)   => api.post('/finance/payments', body),

  // ── Leads / Заявки ────────────────────────────────────────
  leads: () => api.get('/leads'),
  updateLeadStatus: (id, status) => api.patch(`/leads/${id}/status`, { status }),
  deleteLead: (id) => api.del(`/leads/${id}`),

  // ── Doctors ───────────────────────────────────────────────
  doctors: ()        => api.get('/doctors'),
  doctor:  (id)      => api.get(`/doctors/${id}`),
  updateDoctor: (id, b) => api.put(`/doctors/${id}`, b),
  updateDoctorSchedule: (id, b) => api.put(`/doctors/${id}/schedule`, b),
  getDoctorStats: (id) => api.get(`/doctors/${id}/stats`),
  getDoctorPatients: (id, p = '') => api.get(`/doctors/${id}/patients${p}`),

  // ── Users ─────────────────────────────────────────────────
  users:      ()     => api.get('/users'),
  createUser: (body) => api.post('/users', body),
  updateUser: (id, body) => api.put(`/users/${id}`, body),
  deactivateUser: (id) => api.post(`/users/${id}/deactivate`),
  restoreUser: (id) => api.post(`/users/${id}/restore`),

  // ── Logs ──────────────────────────────────────────────────
  logs: () => api.get('/logs'),
};
