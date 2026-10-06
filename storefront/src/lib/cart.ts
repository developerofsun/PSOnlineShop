'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CartItem = {
  productId: number;
  slug: string;
  name: string;
  /** Display price only. The server always re-prices from the database at checkout. */
  price: number;
  image: string | null;
  qty: number;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, qty = 1) =>
        set((s) => {
          const found = s.items.find((i) => i.productId === item.productId);
          if (found) {
            return {
              items: s.items.map((i) =>
                i.productId === item.productId ? { ...i, ...item, qty: Math.min(i.qty + qty, 100) } : i,
              ),
            };
          }
          return { items: [...s.items, { ...item, qty }] };
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          items: s.items.map((i) => (i.productId === productId ? { ...i, qty: Math.max(1, Math.min(qty, 100)) } : i)),
        })),
      remove: (productId) => set((s) => ({ items: s.items.filter((i) => i.productId !== productId) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'onshop-cart' },
  ),
);
