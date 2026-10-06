'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/lib/cart';
import { formatNumber } from '@/lib/format';
import ProductImage from './ProductImage';

export default function CartView() {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { items, setQty, remove } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <p className="text-slate-500">{tc('loading')}</p>;

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-slate-500">{t('empty')}</p>
        <Link href="/products" className="btn">
          {t('continue')}
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <ul className="card divide-y divide-slate-100">
        {items.map((i) => (
          <li key={i.productId} className="flex items-center gap-3 p-3">
            <ProductImage src={i.image} alt={i.name} className="h-16 w-16 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Link href={`/products/${encodeURIComponent(i.slug)}`} className="line-clamp-2 text-sm font-medium hover:text-brand-600">
                {i.name}
              </Link>
              <div className="text-xs text-slate-500">
                {formatNumber(i.price, locale)} {tc('currency')}
              </div>
            </div>
            <input
              type="number"
              min={1}
              max={100}
              value={i.qty}
              aria-label={t('qty')}
              onChange={(e) => setQty(i.productId, Number(e.target.value) || 1)}
              className="input w-16 text-center"
            />
            <button onClick={() => remove(i.productId)} className="text-sm text-red-600 hover:underline">
              {t('remove')}
            </button>
          </li>
        ))}
      </ul>

      <aside className="card h-fit space-y-3 p-4">
        <div className="flex justify-between font-bold">
          <span>{t('subtotal')}</span>
          <span>
            {formatNumber(subtotal, locale)} {tc('currency')}
          </span>
        </div>
        <p className="text-xs text-slate-500">{t('note')}</p>
        <Link href="/checkout" className="btn w-full">
          {t('checkout')}
        </Link>
      </aside>
    </div>
  );
}
