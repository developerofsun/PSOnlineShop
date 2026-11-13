'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useCart } from '@/lib/cart';
import { formatDate, formatNumber, toAsciiDigits } from '@/lib/format';
import type { OrderDetail } from '@/lib/types';
import { LAST_PHONE_KEY } from './CheckoutForm';

export default function OrderView({ number, status, testMode }: { number: string; status?: string; testMode?: boolean }) {
  const t = useTranslations('order');
  const tTest = useTranslations('testMode');
  const tc = useTranslations('common');
  const locale = useLocale();
  const clearCart = useCart((s) => s.clear);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [needPhone, setNeedPhone] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(
    async (phone: string) => {
      const res = await fetch(`/backend/api/orders/${encodeURIComponent(number)}?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) {
        setNotFound(true);
        setNeedPhone(true);
        return;
      }
      setNotFound(false);
      setNeedPhone(false);
      setOrder((await res.json()) as OrderDetail);
    },
    [number],
  );

  useEffect(() => {
    if (status === 'paid' || status === 'pending') clearCart();
    let phone = '';
    try {
      phone = sessionStorage.getItem(LAST_PHONE_KEY) ?? '';
    } catch {
      /* ignore */
    }
    if (phone) void load(phone);
    else setNeedPhone(true);
  }, [status, clearCart, load]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = toAsciiDigits(String(new FormData(e.currentTarget).get('phone') ?? '')).trim();
    void load(phone);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl text-brand-800">
        {t('title')} <span dir="ltr">{number}</span>
      </h1>

      {status === 'paid' && <p className="rounded-lg bg-green-50 p-3 text-green-800">{t('paidOk')}</p>}
      {status === 'pending' && <p className="rounded-lg bg-amber-50 p-3 text-amber-800">{t('placedCod')}</p>}
      {status === 'failed' && <p className="rounded-lg bg-red-50 p-3 text-red-800">{t('paidFail')}</p>}
      {testMode && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {tTest('paymentNotice')}
        </p>
      )}

      {needPhone && (
        <form onSubmit={onSubmit} className="card space-y-3 p-4">
          <p className="text-sm">{t('enterPhone')}</p>
          {notFound && <p className="text-sm text-red-600">{t('notFound')}</p>}
          <div className="flex gap-2">
            <input name="phone" required dir="ltr" inputMode="tel" className="input text-start" placeholder="09123456789" />
            <button className="btn">{t('show')}</button>
          </div>
        </form>
      )}

      {order && (
        <div className="card space-y-3 p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span>
              {t('status')}: <b>{t(`statuses.${order.status}` as never)}</b>
            </span>
            <span>
              {t('date')}: {formatDate(order.createdAt, locale)}
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {order.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2 py-2">
                <span>
                  {i.name} × {formatNumber(i.quantity, locale)}
                </span>
                <span>{formatNumber(i.unitPrice * i.quantity, locale)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between">
            <span>{t('shipping')}</span>
            <span>{formatNumber(order.shippingCost, locale)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>{t('total')}</span>
            <span>
              {formatNumber(order.total, locale)} {tc('currency')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
