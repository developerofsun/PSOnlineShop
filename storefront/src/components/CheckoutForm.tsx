'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { formatNumber, toAsciiDigits } from '@/lib/format';
import { useLocation } from '@/lib/location';
import type { Address } from '@/lib/types';
import { useUi } from '@/lib/ui';
import { PinIcon } from './icons';
import { useMapSettings } from './MapSettings';

export const LAST_PHONE_KEY = 'onshop-last-phone';

type Prefill = { fullName: string; phone: string; province: string; city: string; address: string; postalCode: string };
const EMPTY: Prefill = { fullName: '', phone: '', province: '', city: '', address: '', postalCode: '' };

export default function CheckoutForm() {
  const t = useTranslations('checkout');
  const tc = useTranslations('common');
  const ta = useTranslations('account');
  const locale = useLocale();
  const items = useCart((s) => s.items);
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [prefill, setPrefill] = useState<Prefill>(EMPTY);
  const [formKey, setFormKey] = useState(0);
  const map = useMapSettings();
  const loc = useLocation();
  const setLocationOpen = useUi((s) => s.setLocationOpen);
  useEffect(() => setMounted(true), []);

  // Guests: the address typed next to the map pin becomes the default address text.
  useEffect(() => {
    if (!mounted || token || !loc.label) return;
    setPrefill((p) => (p.address ? p : { ...p, address: loc.label }));
    setFormKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Logged-in customers: load saved addresses and prefill the default one.
  useEffect(() => {
    if (!mounted || !token) return;
    apiFetch<Address[]>('/api/me/addresses')
      .then((list) => {
        setAddresses(list);
        const def = list.find((a) => a.isDefault) ?? list[0];
        if (def) applyAddress(def);
        else if (user) {
          setPrefill({ ...EMPTY, fullName: user.fullName, phone: user.phone ?? '' });
          setFormKey((k) => k + 1);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, token]);

  function applyAddress(a: Address) {
    setPrefill({ fullName: a.fullName, phone: a.phone, province: a.province, city: a.city, address: a.line, postalCode: a.postalCode });
    if (a.lat != null && a.lng != null) loc.set(a.lat, a.lng, a.line); // the saved address carries its map point
    setFormKey((k) => k + 1); // remount inputs so defaultValue is applied
  }

  if (!mounted) return <p className="text-slate-500">{tc('loading')}</p>;
  if (items.length === 0) {
    return (
      <Link href="/products" className="btn">
        {tc('products')}
      </Link>
    );
  }

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const phone = toAsciiDigits(String(f.get('phone') ?? '')).trim();
    try {
      // apiFetch adds the customer's token, so the order shows up in their account.
      const data = await apiFetch<{ orderNumber: string; redirectUrl: string }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          locale,
          items: items.map((i) => ({ productId: i.productId, quantity: i.qty })),
          customer: {
            fullName: String(f.get('fullName') ?? ''),
            phone,
            province: String(f.get('province') ?? ''),
            city: String(f.get('city') ?? ''),
            address: String(f.get('address') ?? ''),
            postalCode: toAsciiDigits(String(f.get('postalCode') ?? '')).trim(),
            note: String(f.get('note') ?? '') || null,
            lat: map.enabled ? loc.lat : null,
            lng: map.enabled ? loc.lng : null,
          },
        }),
      });
      try {
        sessionStorage.setItem(LAST_PHONE_KEY, phone);
      } catch {
        /* storage may be blocked; the order page then asks for the phone */
      }
      window.location.href = data.redirectUrl; // go to the payment gateway
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form key={formKey} onSubmit={onSubmit} className="card space-y-4 p-4">
        {map.enabled && (
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm ${loc.lat != null ? 'border-brand-500 bg-brand-50' : 'border-accent-500 bg-accent-50'}`}>
            <span className="flex items-center gap-2">
              <PinIcon className="h-5 w-5 shrink-0" />
              {loc.lat != null ? t('locationSet') : t('locationMissing')}
            </span>
            <button type="button" className="btn-outline h-8 px-3 text-xs" onClick={() => setLocationOpen(true)}>
              {loc.lat != null ? t('changeLocation') : t('pickLocation')}
            </button>
          </div>
        )}
        {addresses.length > 0 && (
          <label className="block space-y-1 text-sm">
            <span>{ta('savedAddresses')}</span>
            <select
              className="input"
              defaultValue={(addresses.find((a) => a.isDefault) ?? addresses[0]).id}
              onChange={(e) => {
                const a = addresses.find((x) => x.id === Number(e.target.value));
                if (a) applyAddress(a);
              }}
            >
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {a.city}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('fullName')}</span>
            <input name="fullName" required defaultValue={prefill.fullName} className="input" autoComplete="name" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('phone')}</span>
            <input name="phone" required inputMode="tel" dir="ltr" defaultValue={prefill.phone} className="input text-start" placeholder="09123456789" autoComplete="tel" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('province')}</span>
            <input name="province" required defaultValue={prefill.province} className="input" autoComplete="address-level1" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('city')}</span>
            <input name="city" required defaultValue={prefill.city} className="input" autoComplete="address-level2" />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>{t('address')}</span>
          <textarea name="address" required rows={3} defaultValue={prefill.address} className="input" autoComplete="street-address" />
        </label>
        <label className="block space-y-1 text-sm sm:w-1/2">
          <span>{t('postalCode')}</span>
          <input name="postalCode" required inputMode="numeric" dir="ltr" defaultValue={prefill.postalCode} className="input text-start" autoComplete="postal-code" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('note')}</span>
          <textarea name="note" rows={2} className="input" />
        </label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="btn w-full sm:w-auto" disabled={busy}>
          {busy ? t('paying') : t('pay')}
        </button>
      </form>

      <aside className="card h-fit space-y-3 p-4 text-sm">
        <h2 className="font-bold">{t('summary')}</h2>
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-2">
              <span className="line-clamp-1">
                {i.name} × {formatNumber(i.qty, locale)}
              </span>
              <span>{formatNumber(i.price * i.qty, locale)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
          <span>{tc('cart')}</span>
          <span>
            {formatNumber(subtotal, locale)} {tc('currency')}
          </span>
        </div>
        {!token && (
          <p className="text-xs text-slate-500">
            <Link href="/account/login" className="text-brand-600 hover:underline">
              {ta('loginToSave')}
            </Link>
          </p>
        )}
      </aside>
    </div>
  );
}
