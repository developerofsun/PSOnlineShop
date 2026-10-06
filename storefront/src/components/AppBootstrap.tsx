'use client';

import { useEffect } from 'react';
import { apiFetch, useAuth, type AuthUser } from '@/lib/auth';
import { useFavorites } from '@/lib/favorites';

/** On every app start: refresh the logged-in user and merge favorites with the server. Renders nothing. */
export default function AppBootstrap() {
  useEffect(() => {
    if (!useAuth.getState().token) return;
    apiFetch<AuthUser>('/api/auth/me')
      .then((u) => {
        useAuth.getState().setUser(u);
        return useFavorites.getState().sync();
      })
      .catch(() => {});
  }, []);
  return null;
}
