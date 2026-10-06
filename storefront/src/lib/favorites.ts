'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiFetch, useAuth } from './auth';

type FavState = {
  ids: number[];
  toggle: (id: number) => void;
  /** Merge local favorites into the account after login and adopt the server's list. */
  sync: () => Promise<void>;
  clearLocal: () => void;
};

/** Favorites are stored locally for guests and mirrored to the server when logged in. */
export const useFavorites = create<FavState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const on = get().ids.includes(id);
        set({ ids: on ? get().ids.filter((x) => x !== id) : [id, ...get().ids] });
        if (useAuth.getState().token) {
          apiFetch(`/api/me/favorites/${id}`, { method: on ? 'DELETE' : 'PUT' }).catch(() => {});
        }
      },
      sync: async () => {
        if (!useAuth.getState().token) return;
        try {
          const merged = await apiFetch<number[]>('/api/me/favorites/merge', {
            method: 'POST',
            body: JSON.stringify(get().ids),
          });
          set({ ids: merged });
        } catch {
          /* offline or logged out: keep local list */
        }
      },
      clearLocal: () => set({ ids: [] }),
    }),
    { name: 'onshop-favorites' },
  ),
);
