'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const MAX_COMPARE = 4;

type CompareState = {
  ids: number[];
  /** Returns 'added' | 'removed' | 'full'. */
  toggle: (id: number) => 'added' | 'removed' | 'full';
  remove: (id: number) => void;
  clear: () => void;
};

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) => {
        const ids = get().ids;
        if (ids.includes(id)) {
          set({ ids: ids.filter((x) => x !== id) });
          return 'removed';
        }
        if (ids.length >= MAX_COMPARE) return 'full';
        set({ ids: [...ids, id] });
        return 'added';
      },
      remove: (id) => set({ ids: get().ids.filter((x) => x !== id) }),
      clear: () => set({ ids: [] }),
    }),
    { name: 'onshop-compare' },
  ),
);
