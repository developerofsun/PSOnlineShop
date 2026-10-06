'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The customer's chosen delivery point (picked on the map). Kept in the browser; sent with the order. */
type LocationState = {
  lat: number | null;
  lng: number | null;
  /** Free text the customer typed ("Valiasr St., No. 12"), shown in the header. */
  label: string;
  /** The customer pressed "later" on the first-visit prompt. */
  skipped: boolean;
  set: (lat: number, lng: number, label: string) => void;
  skip: () => void;
  clear: () => void;
};

export const useLocation = create<LocationState>()(
  persist(
    (set) => ({
      lat: null,
      lng: null,
      label: '',
      skipped: false,
      set: (lat, lng, label) => set({ lat, lng, label, skipped: false }),
      skip: () => set({ skipped: true }),
      clear: () => set({ lat: null, lng: null, label: '', skipped: false }),
    }),
    { name: 'onshop-location' },
  ),
);
