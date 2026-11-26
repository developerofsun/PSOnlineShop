const TOKEN_KEY = 'onshop-admin-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * The API answers errors either with {error} or with ASP.NET's ProblemDetails ({title, errors}), so show the
 * first readable sentence instead of a bare status code.
 */
export function describeError(data: unknown, status: number): string {
  const d = (data ?? {}) as { error?: unknown; title?: unknown; errors?: Record<string, unknown> };
  if (typeof d.error === 'string' && d.error) return d.error;
  if (d.errors && typeof d.errors === 'object') {
    for (const value of Object.values(d.errors)) {
      const first = Array.isArray(value) ? value.find((v) => typeof v === 'string' && v) : value;
      if (typeof first === 'string' && first) return first;
    }
  }
  if (typeof d.title === 'string' && d.title) return d.title;
  return `خطا (${status})`;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: payload });

  if (res.status === 401 && !url.includes('/auth/login')) {
    clearToken();
    window.location.href = '/login';
    throw new ApiError('نشست شما منقضی شده است.', 401);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(describeError(data, res.status), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(url: string) => request<T>('GET', url),
  post: <T,>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T,>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T = void,>(url: string) => request<T>('DELETE', url),
};
