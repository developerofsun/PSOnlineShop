'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether online payments are switched on (Admin → Settings → Payments).
 *
 * When false the shop pauses checkout: the cart's checkout button is disabled and the checkout
 * page shows a "sales paused" message. The API refuses orders too, so this is only the UI half —
 * the real guard lives in OrdersController.Checkout.
 */
const Ctx = createContext(true);
export const usePaymentEnabled = () => useContext(Ctx);

export function PaymentSettingsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <Ctx.Provider value={enabled}>{children}</Ctx.Provider>;
}
