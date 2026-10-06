'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, useAuth, type AuthUser } from '@/lib/auth';
import { useFavorites } from '@/lib/favorites';
import { toAsciiDigits } from '@/lib/format';

type AuthResponse = { token: string; expires: string; user: AuthUser };

export default function AuthForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const setAuth = useAuth((s) => s.setAuth);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) router.replace('/account');
  }, [token, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res =
        mode === 'login'
          ? await apiFetch<AuthResponse>('/api/auth/login', {
              method: 'POST',
              body: JSON.stringify({ login: toAsciiDigits(String(f.get('login') ?? '')).trim(), password: String(f.get('password') ?? '') }),
            })
          : await apiFetch<AuthResponse>('/api/auth/register', {
              method: 'POST',
              body: JSON.stringify({
                fullName: String(f.get('fullName') ?? ''),
                phone: toAsciiDigits(String(f.get('phone') ?? '')).trim(),
                password: String(f.get('password') ?? ''),
              }),
            });
      setAuth(res.token, res.user);
      await useFavorites.getState().sync(); // merge guest favorites into the account
      router.replace('/account');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="card space-y-4 p-6">
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-md py-2 transition ${mode === m ? 'bg-white font-medium shadow' : 'text-slate-500'}`}
            >
              {t(m)}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <label className="block space-y-1 text-sm">
                <span>{t('fullName')}</span>
                <input name="fullName" required className="input" autoComplete="name" />
              </label>
              <label className="block space-y-1 text-sm">
                <span>{t('phone')}</span>
                <input name="phone" required inputMode="tel" dir="ltr" className="input text-start" placeholder="09123456789" autoComplete="tel" />
              </label>
            </>
          )}
          {mode === 'login' && (
            <label className="block space-y-1 text-sm">
              <span>{t('loginName')}</span>
              <input name="login" required dir="ltr" className="input text-start" autoComplete="username" />
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span>{t('password')}</span>
            <input name="password" type="password" required minLength={mode === 'register' ? 8 : undefined} className="input" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode === 'register' && <span className="text-xs text-slate-400">{t('passwordHint')}</span>}
          </label>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="btn w-full" disabled={busy}>
            {busy ? t('wait') : t(mode)}
          </button>
        </form>
      </div>
    </div>
  );
}
