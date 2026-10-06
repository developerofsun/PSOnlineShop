'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, useAuth } from '@/lib/auth';
import { useFavorites } from '@/lib/favorites';
import { formatDate, formatNumber, toAsciiDigits } from '@/lib/format';
import type { Address, OrderDetail, OrderListItem, Paged, Payment, Profile } from '@/lib/types';
import FavoritesView from './FavoritesView';
import type { LatLng } from './MapPicker';
import MapPickerLoader from './MapPickerLoader';
import { useMapSettings } from './MapSettings';

type Tab = 'profile' | 'orders' | 'payments' | 'addresses' | 'favorites';
const TABS: Tab[] = ['profile', 'orders', 'payments', 'addresses', 'favorites'];

export default function AccountPanel() {
  const t = useTranslations('account');
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [tab, setTab] = useState<Tab>('profile');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && !token) router.replace('/account/login');
  }, [mounted, token, router]);

  if (!mounted || !token) return null;

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="card h-fit p-3">
        <p className="px-2 pb-3 text-sm text-slate-500">{user?.fullName}</p>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm transition ${tab === k ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-slate-50'}`}
            >
              {t(`tabs.${k}`)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              logout();
              useFavorites.getState().clearLocal();
              router.replace('/');
            }}
            className="whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm text-red-600 hover:bg-red-50"
          >
            {t('logout')}
          </button>
        </nav>
      </aside>

      <section className="min-w-0">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'addresses' && <AddressesTab />}
        {tab === 'favorites' && <FavoritesView />}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- profile + password

function ProfileTab() {
  const t = useTranslations('account');
  const locale = useLocale();
  const setUser = useAuth((s) => s.setUser);
  const user = useAuth((s) => s.user);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiFetch<Profile>('/api/me/profile').then(setProfile).catch(() => {});
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const p = await apiFetch<Profile>('/api/me/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName: String(f.get('fullName') ?? ''), email: String(f.get('email') ?? '') || null }),
      });
      setProfile(p);
      if (user) setUser({ ...user, fullName: p.fullName, email: p.email });
      setMsg({ ok: true, text: t('saved') });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : t('error') });
    }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await apiFetch('/api/me/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: String(f.get('current') ?? ''), newPassword: String(f.get('next') ?? '') }),
      });
      form.reset();
      setMsg({ ok: true, text: t('passwordChanged') });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : t('error') });
    }
  }

  if (!profile) return <p className="text-slate-500">…</p>;

  return (
    <div className="space-y-6">
      {msg && <p className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <form onSubmit={save} className="card space-y-4 p-4">
        <h2 className="font-bold">{t('tabs.profile')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('fullName')}</span>
            <input name="fullName" required defaultValue={profile.fullName} className="input" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('phone')}</span>
            <input value={profile.phone ?? ''} readOnly dir="ltr" className="input bg-slate-50 text-start" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('email')}</span>
            <input name="email" type="email" dir="ltr" defaultValue={profile.email ?? ''} className="input text-start" />
          </label>
          <p className="self-end text-xs text-slate-400">
            {t('memberSince')}: {formatDate(profile.createdAt, locale)}
          </p>
        </div>
        <button className="btn">{t('save')}</button>
      </form>

      <form onSubmit={changePassword} className="card space-y-4 p-4">
        <h2 className="font-bold">{t('changePassword')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('currentPassword')}</span>
            <input name="current" type="password" required className="input" autoComplete="current-password" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('newPassword')}</span>
            <input name="next" type="password" required minLength={8} className="input" autoComplete="new-password" />
          </label>
        </div>
        <button className="btn-outline">{t('changePassword')}</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- orders

function OrdersTab() {
  const t = useTranslations('account');
  const to = useTranslations('order');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [data, setData] = useState<Paged<OrderListItem> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, OrderDetail>>({});

  useEffect(() => {
    apiFetch<Paged<OrderListItem>>('/api/me/orders?pageSize=50').then(setData).catch(() => setData({ items: [], total: 0, page: 1, pageSize: 50 }));
  }, []);

  async function toggle(number: string) {
    if (open === number) return setOpen(null);
    setOpen(number);
    if (!detail[number]) {
      try {
        const d = await apiFetch<OrderDetail>(`/api/me/orders/${encodeURIComponent(number)}`);
        setDetail((m) => ({ ...m, [number]: d }));
      } catch {
        /* ignore */
      }
    }
  }

  if (!data) return <p className="text-slate-500">…</p>;
  if (data.items.length === 0) return <p className="py-10 text-center text-slate-500">{t('noOrders')}</p>;

  return (
    <ul className="space-y-3">
      {data.items.map((o) => {
        const d = detail[o.number];
        return (
          <li key={o.id} className="card">
            <button type="button" onClick={() => toggle(o.number)} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-start" aria-expanded={open === o.number}>
              <span className="font-medium" dir="ltr">
                {o.number}
              </span>
              <span className="text-sm text-slate-500">{formatDate(o.createdAt, locale)}</span>
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs">{to(`statuses.${o.status}` as never)}</span>
              <span className="text-sm font-bold">
                {formatNumber(o.total, locale)} {tc('currency')}
              </span>
            </button>
            {open === o.number && (
              <div className="space-y-2 border-t border-slate-100 p-4 text-sm">
                {!d ? (
                  <p className="text-slate-500">…</p>
                ) : (
                  <>
                    <ul className="divide-y divide-slate-100">
                      {d.items.map((i, idx) => (
                        <li key={idx} className="flex justify-between gap-2 py-1.5">
                          <span>
                            {i.name} × {formatNumber(i.quantity, locale)}
                          </span>
                          <span>{formatNumber(i.unitPrice * i.quantity, locale)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-slate-500">
                      {d.province}، {d.city}، {d.address} — <span dir="ltr">{d.postalCode}</span>
                    </p>
                    {d.paymentRef && (
                      <p className="text-slate-500">
                        {t('paymentRef')}: <span dir="ltr">{d.paymentRef}</span>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- payments

function PaymentsTab() {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [rows, setRows] = useState<Payment[] | null>(null);

  useEffect(() => {
    apiFetch<Payment[]>('/api/me/payments').then(setRows).catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="text-slate-500">…</p>;
  if (rows.length === 0) return <p className="py-10 text-center text-slate-500">{t('noPayments')}</p>;

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="p-3 text-start font-medium">{t('order')}</th>
            <th className="p-3 text-start font-medium">{t('amount')}</th>
            <th className="p-3 text-start font-medium">{t('paymentRef')}</th>
            <th className="p-3 text-start font-medium">{t('date')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.orderNumber} className="border-t border-slate-100">
              <td className="p-3" dir="ltr">
                {p.orderNumber}
              </td>
              <td className="p-3">
                {formatNumber(p.amount, locale)} {tc('currency')}
              </td>
              <td className="p-3" dir="ltr">
                {p.reference ?? '—'}
              </td>
              <td className="p-3">{formatDate(p.paidAt, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- addresses

function AddressesTab() {
  const t = useTranslations('account');
  const tch = useTranslations('checkout');
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const map = useMapSettings();
  const [pt, setPt] = useState<LatLng | null>(null);

  const startEdit = (a: Address | 'new') => {
    setPt(a !== 'new' && a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null);
    setEditing(a);
  };

  const load = useCallback(() => apiFetch<Address[]>('/api/me/addresses').then(setList).catch(() => setList([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const body = {
      title: String(f.get('title') ?? ''),
      fullName: String(f.get('fullName') ?? ''),
      phone: toAsciiDigits(String(f.get('phone') ?? '')).trim(),
      province: String(f.get('province') ?? ''),
      city: String(f.get('city') ?? ''),
      line: String(f.get('line') ?? ''),
      postalCode: toAsciiDigits(String(f.get('postalCode') ?? '')).trim(),
      isDefault: f.get('isDefault') === 'on',
      lat: map.enabled ? (pt?.lat ?? null) : null,
      lng: map.enabled ? (pt?.lng ?? null) : null,
    };
    try {
      if (editing === 'new') await apiFetch('/api/me/addresses', { method: 'POST', body: JSON.stringify(body) });
      else if (editing) await apiFetch(`/api/me/addresses/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    }
  }

  if (!list) return <p className="text-slate-500">…</p>;

  if (editing) {
    const a = editing === 'new' ? null : editing;
    return (
      <form onSubmit={save} className="card space-y-4 p-4">
        <h2 className="font-bold">{a ? t('editAddress') : t('addAddress')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('addressTitle')}</span>
            <input name="title" defaultValue={a?.title ?? ''} className="input" placeholder={t('addressTitleHint')} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tch('fullName')}</span>
            <input name="fullName" required defaultValue={a?.fullName ?? ''} className="input" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tch('phone')}</span>
            <input name="phone" required dir="ltr" inputMode="tel" defaultValue={a?.phone ?? ''} className="input text-start" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tch('postalCode')}</span>
            <input name="postalCode" required dir="ltr" inputMode="numeric" defaultValue={a?.postalCode ?? ''} className="input text-start" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tch('province')}</span>
            <input name="province" required defaultValue={a?.province ?? ''} className="input" />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tch('city')}</span>
            <input name="city" required defaultValue={a?.city ?? ''} className="input" />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>{tch('address')}</span>
          <textarea name="line" required rows={3} defaultValue={a?.line ?? ''} className="input" />
        </label>
        {map.enabled && (
          <div className="space-y-1">
            <span className="text-sm">{t('mapLocation')}</span>
            <MapPickerLoader value={pt} onChange={setPt} tileUrl={map.tileUrl} center={{ lat: map.centerLat, lng: map.centerLng }} zoom={map.zoom} height={260} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" defaultChecked={a?.isDefault ?? false} className="accent-brand-600" />
          {t('makeDefault')}
        </label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button className="btn">{t('save')}</button>
          <button type="button" className="btn-outline" onClick={() => setEditing(null)}>
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" className="btn" onClick={() => startEdit('new')}>
        {t('addAddress')}
      </button>
      {list.length === 0 && <p className="py-6 text-center text-slate-500">{t('noAddresses')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className="card space-y-1 p-4 text-sm">
            <div className="flex items-center justify-between">
              <b>{a.title}</b>
              {a.isDefault && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{t('default')}</span>}
            </div>
            <p>{a.fullName}</p>
            <p dir="ltr" className="text-start">
              {a.phone}
            </p>
            <p className="text-slate-500">
              {a.province}، {a.city}، {a.line}
            </p>
            <p className="text-slate-500" dir="ltr">
              {a.postalCode}
            </p>
            <div className="flex gap-3 pt-2">
              <button type="button" className="text-brand-700 hover:underline" onClick={() => startEdit(a)}>
                {t('edit')}
              </button>
              <button
                type="button"
                className="text-red-600 hover:underline"
                onClick={async () => {
                  await apiFetch(`/api/me/addresses/${a.id}`, { method: 'DELETE' });
                  await load();
                }}
              >
                {t('delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
