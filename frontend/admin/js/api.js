const API_BASE = 'https://intan-backend.onrender.com/api';

const api = {
  getToken() {
    return localStorage.getItem('access_token');
  },
  setToken(token) {
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
  },

  async login(email, password) {
    return this.request('POST', '/auth/login', { email, password });
  },

  async me() {
    return this.request('GET', '/auth/me');
  },

  async dashboard() {
    return this.request('GET', '/dashboard');
  },

  async post(path, body = null, opts = {}) {
    return this.request('POST', path, body, opts);
  },

  async request(method, path, body = null, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const config = { method, headers };
    
    if (body && !(body instanceof FormData)) {
      config.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      delete headers['Content-Type'];
      config.body = body;
    }
    
    try {
      let res = await fetch(`${API_BASE}${path}`, config);
      
      // ── 429: Rate Limit ──
      if (res.status === 429) {
        throw new Error('Слишком много запросов. Подождите минуту и обновите страницу.');
      }
      
      // ── 401: Unauthorized ──
      if (res.status === 401 && !opts.noRefresh) {
        // Чистим сессию и выходим без повторных циклов
        this.setToken(null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('token');
        
        if (typeof App !== 'undefined') App.showAuth();
        return null;
      }
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || 'Ошибка запроса');
      }
      
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
      return res;
    } catch (e) {
      console.error(`API [${method} ${path}]:`, e.message);
      throw e;
    }
  }
};