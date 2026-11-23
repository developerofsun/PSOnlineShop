'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/lib/cart';
import { formatNumber } from '@/lib/format';
import { useUi } from '@/lib/ui';
import { CloseIcon, MinusIcon, PlusIcon, TrashIcon } from './icons';
import { usePaymentEnabled } from './PaymentSettings';
import ProductImage from './ProductImage';

/** Slide-in cart: review quantities and go to checkout without leaving the page. Opened from the header cart button. */
export default function MiniCart() {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const locale = useLocale();
  const open = useUi((s) => s.cartOpen);
  const setOpen = useUi((s) => s.setCartOpen);
  const { items, setQty, remove } = useCart();
  const paymentEnabled = usePaymentEnabled();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // no background scrolling while the drawer is open
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen]);

  const list = mounted ? items : [];
  const subtotal = list.reduce((n, i) => n + i.price * i.qty, 0);

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        inert={!open}
        className={`fixed inset-y-0 end-0 z-[61] flex w-full max-w-sm flex-col bg-white transition-transform duration-200 ${
          open ? 'translate-x-0' : 'ltr:translate-x-full rtl:-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-bold">
            {t('title')} {list.length > 0 && <span className="text-sm font-normal text-slate-500">({formatNumber(list.reduce((n, i) => n + i.qty, 0), locale)})</span>}
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label={t('close')} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {list.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-slate-500">
            <div>
              <p className="mb-4">{t('empty')}</p>
              <Link href="/products" className="btn" onClick={() => setOpen(false)}>
                {t('continue')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto px-4">
              {list.map((i) => (
                <li key={i.productId} className="flex gap-3 py-3">
                  <ProductImage src={i.image} alt={i.name} className="h-16 w-16 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${encodeURIComponent(i.slug)}`} onClick={() => setOpen(false)} className="line-clamp-2 text-[13px] font-medium hover:text-brand-700">
                      {i.name}
                    </Link>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatNumber(i.price, locale)} {tc('currency')}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center overflow-hidden rounded-lg border border-brand-600">
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center text-brand-700 hover:bg-brand-50"
                          aria-label={i.qty <= 1 ? t('remove') : '−'}
                          onClick={() => (i.qty <= 1 ? remove(i.productId) : setQty(i.productId, i.qty - 1))}
                        >
                          {i.qty <= 1 ? <TrashIcon className="h-4 w-4" /> : <MinusIcon className="h-4 w-4" />}
                        </button>
                        <span className="min-w-7 text-center text-sm font-bold">{formatNumber(i.qty, locale)}</span>
                        <button type="button" className="grid h-8 w-8 place-items-center text-brand-700 hover:bg-brand-50" aria-label="+" onClick={() => setQty(i.productId, i.qty + 1)}>
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="text-sm font-bold">{formatNumber(i.price * i.qty, locale)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3 border-t border-slate-200 p-4">
              <div className="flex justify-between font-bold">
                <span>{t('subtotal')}</span>
                <span>
                  {formatNumber(subtotal, locale)} {tc('currency')}
                </span>
              </div>
              <p className="text-xs text-slate-500">{t('note')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/cart" className="btn-outline" onClick={() => setOpen(false)}>
                  {t('viewCart')}
                </Link>
                {paymentEnabled ? (
                  <Link href="/checkout" className="btn" onClick={() => setOpen(false)}>
                    {t('checkout')}
                  </Link>
                ) : (
                  <span className="btn cursor-not-allowed opacity-50" aria-disabled="true">
                    {t('checkout')}
                  </span>
                )}
              </div>
              {!paymentEnabled && <p className="text-xs text-amber-700">{t('salesPaused')}</p>}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
