'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, useAuth } from '@/lib/auth';
import Shop3DLoader from './Shop3DLoader';
import type { Aisle } from './Shop3D';

type Status = { enabled: boolean; limitMinutes: number; usedSeconds: number; remainingSeconds: number | null };
type Phase = 'checking' | 'login' | 'blocked' | 'error' | 'ok';

/**
 * Who may be in the 3D store and for how long.
 *  - Admin setting "login required": guests see a sign-in card instead of the store.
 *  - Admin setting "daily minutes": the server counts the time (start + heartbeat every 10 s while the tab is visible);
 *    when it runs out the store is replaced by a "come back tomorrow" card.
 * The server is the source of truth for the time; this component only displays the countdown between heartbeats.
 */
export default function Shop3DGate({
  aisles,
  storeName,
  logoUrl,
  findId,
  loginRequired,
}: {
  aisles: Aisle[];
  storeName: string;
  logoUrl: string | null;
  findId: number | null;
  loginRequired: boolean;
}) {
  const t = useTranslations('shop3d');
  const token = useAuth((s) => s.token);
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>('checking');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitMinutes, setLimitMinutes] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setMounted(true), []);

  // Decide access (and start counting) once the persisted login is known.
  useEffect(() => {
    if (!mounted) return;
    if (!token) {
      setRemaining(null);
      setPhase(loginRequired ? 'login' : 'ok'); // guests are not limited when the admin allows them in
      return;
    }
    setPhase('checking');
    apiFetch<Status>('/api/me/shop3d/start', { method: 'POST' })
      .then((s) => {
        setLimitMinutes(s.limitMinutes);
        if (!s.enabled) return setPhase('error');
        if (s.remainingSeconds != null && s.remainingSeconds <= 0) return setPhase('blocked');
        setRemaining(s.remainingSeconds);
        setPhase('ok');
      })
      .catch(() => setPhase('error'));
  }, [mounted, token, loginRequired, attempt]);

  // Countdown + heartbeat (only while the tab is visible and the customer is actually in the store)
  const timed = phase === 'ok' && remaining != null;
  useEffect(() => {
    if (!timed) return;
    let tick = 0;
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setRemaining((r) => (r == null ? r : Math.max(0, r - 1)));
      if (++tick % 10 === 0)
        apiFetch<Status>('/api/me/shop3d/beat', { method: 'POST' })
          .then((s) => s.remainingSeconds != null && setRemaining(s.remainingSeconds))
          .catch(() => {});
    }, 1000);
    return () => clearInterval(id);
  }, [timed]);

  useEffect(() => {
    if (phase === 'ok' && remaining != null && remaining <= 0) {
      setPhase('blocked');
      apiFetch<Status>('/api/me/shop3d/beat', { method: 'POST' }).catch(() => {});
    }
  }, [phase, remaining]);

  const card = (title: string, text: string, actions: React.ReactNode) => (
    <div className="card mx-auto max-w-md space-y-3 p-8 text-center">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="text-sm leading-7 text-slate-600">{text}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">{actions}</div>
    </div>
  );

  const listLink = (
    <Link href="/products" className="btn-outline">
      {t('listView')}
    </Link>
  );

  if (!mounted || phase === 'checking') return <div className="h-[72vh] min-h-[460px] animate-pulse rounded-md bg-slate-100" aria-hidden />;

  if (phase === 'login')
    return card(
      t('loginTitle'),
      t('loginText'),
      <>
        <Link href="/account/login" className="btn">
          {t('loginButton')}
        </Link>
        {listLink}
      </>,
    );

  if (phase === 'blocked')
    return card(t('limitTitle'), t('limitText', { minutes: limitMinutes }), listLink);

  if (phase === 'error')
    return card(
      t('errorTitle'),
      t('errorText'),
      <>
        <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>
          {t('retry')}
        </button>
        {listLink}
      </>,
    );

  return <Shop3DLoader aisles={aisles} storeName={storeName} logoUrl={logoUrl} findId={findId} remainingSeconds={remaining} />;
}
