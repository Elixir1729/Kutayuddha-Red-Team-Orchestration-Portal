import { TokenResponse, User, RegisterRequest } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    if (response.status === 401) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
      }
    }
    const errorBody = await response.text().catch(() => 'Unknown error');
    throw new ApiError(response.status, errorBody);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data: RegisterRequest) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request<User>('/auth/me'),
  refreshToken: () => request<TokenResponse>('/auth/refresh', { method: 'POST' }),
  seedAdmin: () => request<User>('/auth/seed-admin', { method: 'POST' }),

  // Engagements
  getEngagements: () => request<any>('/engagements'),
  getEngagement: (id: string) => request<any>(`/engagements/${id}`),
  createEngagement: (data: any) => request<any>('/engagements', { method: 'POST', body: JSON.stringify(data) }),
  updateEngagement: (id: string, data: any) => request<any>(`/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  startEngagement: (id: string) => request<any>(`/engagements/${id}/start`, { method: 'POST' }),
  pauseEngagement: (id: string) => request<any>(`/engagements/${id}/pause`, { method: 'POST' }),
  stopEngagement: (id: string) => request<any>(`/engagements/${id}/stop`, { method: 'POST' }),

  // Operations
  getOperations: (engagementId?: string) => {
    const query = engagementId ? `?engagement_id=${engagementId}` : '';
    return request<any>(`/operations${query}`);
  },
  getOperation: (id: string) => request<any>(`/operations/${id}`),

  // Approvals
  getApprovals: (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return request<any>(`/approvals${query}`);
  },
  approveRequest: (id: string, notes?: string) =>
    request<any>(`/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes }) }),
  denyRequest: (id: string, notes?: string) =>
    request<any>(`/approvals/${id}/deny`, { method: 'POST', body: JSON.stringify({ notes }) }),

  // Findings
  getFindings: (engagementId?: string) => {
    const query = engagementId ? `?engagement_id=${engagementId}` : '';
    return request<any>(`/findings${query}`);
  },
  getFinding: (id: string) => request<any>(`/findings/${id}`),

  // Audit Log
  getAuditLog: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/audit${query}`);
  },

  // Kill Switch (uses the stop engagement endpoint)
  activateKillSwitch: (engagementId: string) =>
    request<any>(`/engagements/${engagementId}/stop`, { method: 'POST' }),

  // Dashboard
  getDashboardStats: () => request<any>('/dashboard/stats'),
};

export { ApiError };
export default api;
