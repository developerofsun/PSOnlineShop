'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import { useCart } from '@/lib/cart';
import { useCompare } from '@/lib/compare';
import { useFavorites } from '@/lib/favorites';
import { formatNumber } from '@/lib/format';
import { useUi } from '@/lib/ui';
import { CartIcon, CompareIcon, HeartIcon, SearchIcon, UserIcon } from './icons';

function Badge({ n, locale }: { n: number; locale: string }) {
  if (n <= 0) return null;
  return (
    // key = count: the small "bump" animation replays each time the number changes (that is the only cart animation)
    <span key={n} className="absolute -end-1.5 -top-1.5 grid min-w-[1.1rem] animate-bump place-items-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-4 text-slate-900">
      {formatNumber(n, locale)}
    </span>
  );
}

const iconBtn = 'site-header-icon relative grid place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700';

export default function HeaderActions() {
  const t = useTranslations('common');
  const locale = useLocale();
  const cartCount = useCart((s) => s.items.reduce((n, i) => n + i.qty, 0));
  const cartTotal = useCart((s) => s.items.reduce((n, i) => n + i.qty * i.price, 0));
  const favCount = useFavorites((s) => s.ids.length);
  const compareCount = useCompare((s) => s.ids.length);
  const user = useAuth((s) => s.user);
  const setCartOpen = useUi((s) => s.setCartOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center gap-1">
      <Link href="/compare" className={`${iconBtn} hidden md:grid`} aria-label={t('compare')} title={t('compare')}>
        <CompareIcon className="h-5 w-5" />
        {mounted && <Badge n={compareCount} locale={locale} />}
      </Link>
      <Link href="/favorites" className={`${iconBtn} hidden md:grid`} aria-label={t('favorites')} title={t('favorites')}>
        <HeartIcon className="h-5 w-5" />
        {mounted && <Badge n={favCount} locale={locale} />}
      </Link>
      <button type="button" onClick={() => setSearchOpen(true)} className={`${iconBtn} md:hidden`} aria-label={t('search')} title={t('search')}>
        <SearchIcon className="h-5 w-5" />
      </button>
      <Link
        href={mounted && user ? '/account' : '/account/login'}
        className={iconBtn}
        aria-label={mounted && user ? user.fullName : t('login')}
        title={mounted && user ? user.fullName : t('login')}
      >
        <UserIcon className="h-5 w-5" />
      </Link>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="site-header-cart ms-1 flex items-center gap-2 rounded-lg px-3 text-white transition-colors"
        aria-label={t('cart')}
      >
        <span className="relative">
          <CartIcon className="h-5 w-5" />
          {mounted && <Badge n={cartCount} locale={locale} />}
        </span>
        <span className="hidden text-sm font-semibold lg:inline">
          {mounted && cartTotal > 0 ? `${formatNumber(cartTotal, locale)} ${t('currency')}` : t('cart')}
        </span>
      </button>
    </div>
  );
}
