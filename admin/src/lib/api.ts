const TOKEN_KEY = 'onshop-admin-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
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
    throw new ApiError(data.error ?? data.title ?? `خطا (${res.status})`, res.status);
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
