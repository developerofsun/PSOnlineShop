'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/auth';
import { toAsciiDigits } from '@/lib/format';

const SEEN_KEY = 'onshop-test-notice-seen';

/**
 * Startup notice for the test version: explains that nothing is really sold yet and offers to
 * collect a phone number so the visitor can be told when the shop goes live.
 * Shown once per browser (localStorage); the ribbon stays visible on every page.
 */
export default function TestModeNotice({ ribbon }: { ribbon: string }) {
  const t = useTranslations('testMode');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== '1') setOpen(true);
    } catch {
      setOpen(true); // storage blocked: show it rather than silently hiding the notice
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch<{ ok: boolean; message?: string }>('/api/notify/signup', {
        method: 'POST',
        body: JSON.stringify({ phone: toAsciiDigits(phone).trim(), source: locale }),
      });
      setDone(true);
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Ribbon: always visible while test mode is on, so nobody mistakes the shop for a live one. */}
      <div className="bg-amber-400 px-3 py-1.5 text-center text-xs font-medium text-amber-950 sm:text-sm">
        {ribbon}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="test-mode-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="test-mode-title" className="font-display text-xl text-brand-800">
              {t('title')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t('body')}</p>

            {done ? (
              <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{t('thanks')}</p>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <label htmlFor="test-mode-phone" className="block text-sm font-medium">
                  {t('phoneLabel')}
                </label>
                <input
                  id="test-mode-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09123456789"
                  className="input text-start"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button className="btn w-full" disabled={busy}>
                  {busy ? t('sending') : t('submit')}
                </button>
              </form>
            )}

            <button onClick={close} className="mt-3 w-full text-sm text-slate-500 hover:text-slate-700">
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
