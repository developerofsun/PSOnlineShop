'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/cart';
import { formatNumber } from '@/lib/format';
import { MinusIcon, PlusIcon, TrashIcon } from './icons';

type Props = {
  productId: number;
  slug: string;
  name: string;
  price: number;
  image: string | null;
  stock: number;
  /** 'compact' is used inside product cards and tables. */
  size?: 'normal' | 'compact';
};

/**
 * "Add" button that turns into a − 1 + stepper in place once the product is in the cart
 * (the same pattern grocery apps use). No flying animation: the change happens right where you clicked.
 */
export default function AddToCart({ productId, slug, name, price, image, stock, size = 'normal' }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const qty = useCart((s) => s.items.find((i) => i.productId === productId)?.qty ?? 0);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (stock <= 0) {
    return <span className="block py-2 text-center text-sm font-bold text-slate-400">{t('common.outOfStock')}</span>;
  }

  const q = mounted ? qty : 0; // the persisted cart is only known in the browser
  const max = Math.min(stock, 100);
  const h = size === 'compact' ? 'h-9' : 'h-11';
  const btn = `grid ${h} w-10 place-items-center text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`;

  if (q === 0) {
    return (
      <button
        type="button"
        className={`btn w-full gap-1 ${h} ${size === 'compact' ? 'text-xs' : 'text-sm sm:w-auto sm:min-w-[9rem]'}`}
        onClick={() => add({ productId, slug, name, price, image })}
      >
        <PlusIcon className="h-4 w-4" />
        {t('products.addToCart')}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={name}
      className={`flex w-full items-center justify-between overflow-hidden rounded-lg border border-brand-600 bg-white ${size === 'normal' ? 'sm:w-auto sm:min-w-[9rem]' : ''}`}
    >
      <button
        type="button"
        className={btn}
        aria-label={q <= 1 ? t('cart.remove') : t('products.decrease')}
        onClick={() => (q <= 1 ? remove(productId) : setQty(productId, q - 1))}
      >
        {q <= 1 ? <TrashIcon className="h-4 w-4" /> : <MinusIcon className="h-4 w-4" />}
      </button>
      <span className="min-w-8 text-center text-sm font-bold" aria-live="polite">
        {formatNumber(q, locale)}
      </span>
      <button
        type="button"
        className={btn}
        aria-label={t('products.increase')}
        title={q >= max ? t('products.maxStock') : undefined}
        disabled={q >= max}
        onClick={() => setQty(productId, q + 1)}
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
