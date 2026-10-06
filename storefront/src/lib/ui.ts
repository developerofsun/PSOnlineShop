'use client';

import { create } from 'zustand';

/** Transient UI state shared between distant components (not persisted). */
type UiState = {
  cartOpen: boolean;
  locationOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setLocationOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  cartOpen: false,
  locationOpen: false,
  setCartOpen: (cartOpen) => set({ cartOpen }),
  setLocationOpen: (locationOpen) => set({ locationOpen }),
}));
