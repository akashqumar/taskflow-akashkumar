import axios from 'axios';

const BASE_URL = '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tf_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear auth and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tf_token');
      localStorage.removeItem('tf_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (name: string, email: string, password: string) =>
    api.post('/auth/register', { name, email, password }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
};

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (page = 1, limit = 20) =>
    api.get('/projects', { params: { page, limit } }),
  create: (payload: { name: string; description?: string; is_private?: boolean }) =>
    api.post('/projects', payload),
  get: (id: string) =>
    api.get(`/projects/${id}`),
  update: (id: string, payload: { name?: string; description?: string; is_private?: boolean }) =>
    api.patch(`/projects/${id}`, payload),
  delete: (id: string) =>
    api.delete(`/projects/${id}`),
  stats: (id: string) =>
    api.get(`/projects/${id}/stats`),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/users'),
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (projectId: string, params?: { status?: string; assignee?: string; page?: number; limit?: number }) =>
    api.get(`/projects/${projectId}/tasks`, { params }),
  create: (projectId: string, payload: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/tasks`, payload),
  update: (taskId: string, payload: Record<string, unknown>) =>
    api.patch(`/tasks/${taskId}`, payload),
  delete: (taskId: string) =>
    api.delete(`/tasks/${taskId}`),
};
