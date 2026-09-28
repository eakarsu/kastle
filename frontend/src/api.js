const API_BASE = '/api';
const TOKEN_KEY = 'kastle_operator_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) logout();
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.code = data.code;
    throw error;
  }
  return data;
}

export async function login(tenant, email, password) {
  const response = await api('/auth/login', { method: 'POST', body: JSON.stringify({ tenant, email, password }) });
  localStorage.setItem(TOKEN_KEY, response.token);
  return response;
}

export async function loadDemoCredentials() {
  return api('/auth/demo-credentials');
}
