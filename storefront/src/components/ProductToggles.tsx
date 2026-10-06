'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_COMPARE, useCompare } from '@/lib/compare';
import { useFavorites } from '@/lib/favorites';
import { CompareIcon, HeartIcon } from './icons';

/** Hydration-safe: persisted stores are only read after mount so server and client markup agree. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

const base = 'grid h-8 w-8 place-items-center rounded-md border transition-colors';

export function FavButton({ productId, className = '' }: { productId: number; className?: string }) {
  const t = useTranslations('favorites');
  const mounted = useMounted();
  const on = useFavorites((s) => s.ids.includes(productId));
  const toggle = useFavorites((s) => s.toggle);
  const active = mounted && on;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? t('remove') : t('add')}
      title={active ? t('remove') : t('add')}
      onClick={() => toggle(productId)}
      className={`${base} ${active ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-400 hover:text-rose-600'} ${className}`}
    >
      <HeartIcon filled={active} className="h-[18px] w-[18px]" />
    </button>
  );
}

export function CompareButton({ productId, className = '' }: { productId: number; className?: string }) {
  const t = useTranslations('compare');
  const mounted = useMounted();
  const on = useCompare((s) => s.ids.includes(productId));
  const toggle = useCompare((s) => s.toggle);
  const [shake, setShake] = useState(false);
  const active = mounted && on;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? t('remove') : t('add')}
      title={shake ? t('full', { max: MAX_COMPARE }) : active ? t('remove') : t('add')}
      onClick={() => {
        if (toggle(productId) === 'full') {
          setShake(true);
          setTimeout(() => setShake(false), 500);
        }
      }}
      className={`${base} ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-400 hover:text-brand-600'} ${shake ? 'animate-shake' : ''} ${className}`}
    >
      <CompareIcon active={active} className="h-[18px] w-[18px]" />
    </button>
  );
}
