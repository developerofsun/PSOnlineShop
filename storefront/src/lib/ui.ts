'use client';

import { create } from 'zustand';

/** Transient UI state shared between distant components (not persisted). */
type UiState = {
  cartOpen: boolean;
  locationOpen: boolean;
  searchOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setLocationOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
};

export const useUi = create<UiState>()((set) => ({
  cartOpen: false,
  locationOpen: false,
  searchOpen: false,
  setCartOpen: (cartOpen) => set({ cartOpen }),
  setLocationOpen: (locationOpen) => set({ locationOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}));
