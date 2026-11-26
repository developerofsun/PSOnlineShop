'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: number;
  fullName: string;
  userName: string | null;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
};

/** Customer session. The token lives in localStorage (same trade-off as the admin app). */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'onshop-auth' },
  ),
);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Client-side call to the API through the same-origin /backend proxy, with the customer's token if logged in. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = useAuth.getState().token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/backend${path}`, { ...init, headers });
  if (res.status === 401 && token) {
    useAuth.getState().logout();
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // {error} from our endpoints, or ASP.NET's {title, errors}; never a bare "Error 400".
    const errors = (data.errors ?? {}) as Record<string, unknown>;
    const firstError = Object.values(errors)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .find((v): v is string => typeof v === 'string' && v.length > 0);
    throw new ApiError(data.error ?? firstError ?? data.title ?? `Error ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
