import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from './api';
import type { AuthResponse, UserInfo } from './types';

type AuthCtx = {
  user: UserInfo | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  /** True when the user holds at least one of the given permissions. */
  can: (...permissions: string[]) => boolean;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

/** Anyone holding at least one permission may enter the dashboard; what they see depends on their permissions. */
const isStaff = (u: UserInfo) => u.permissions.length > 0;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api
      .get<UserInfo>('/api/auth/me')
      .then((u) => (isStaff(u) ? setUser(u) : clearToken()))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (loginName: string, password: string) => {
    const res = await api.post<AuthResponse>('/api/auth/login', { login: loginName, password });
    if (!isStaff(res.user)) throw new Error('شما اجازه‌ی ورود به پیشخوان را ندارید.');
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const perms = new Set(user?.permissions ?? []);
    return {
      user,
      loading,
      login,
      logout,
      can: (...p) => p.some((x) => perms.has(x)),
      isAdmin: !!user?.roles.includes('Admin'),
    };
  }, [user, loading, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
