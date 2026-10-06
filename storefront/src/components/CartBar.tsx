'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/cart';
import { formatNumber } from '@/lib/format';
import { useUi } from '@/lib/ui';
import { CartIcon } from './icons';

/** Mobile-only bar pinned to the bottom of the screen while the cart has items: total price and a way to open it. */
export default function CartBar() {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const locale = useLocale();
  const items = useCart((s) => s.items);
  const open = useUi((s) => s.cartOpen);
  const setOpen = useUi((s) => s.setCartOpen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || items.length === 0 || open) return null;
  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.price * i.qty, 0);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-between rounded-md bg-brand-600 px-4 py-3 text-white shadow-lg md:hidden"
    >
      <span className="flex items-center gap-2 font-bold">
        <CartIcon className="h-5 w-5" />
        {t('viewCart')} ({formatNumber(count, locale)})
      </span>
      <span className="font-bold">
        {formatNumber(total, locale)} {tc('currency')}
      </span>
    </button>
  );
}
