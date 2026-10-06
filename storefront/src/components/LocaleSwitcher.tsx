'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export default function LocaleSwitcher({ className = 'rounded-md px-3 py-2 text-sm hover:bg-slate-100' }: { className?: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <Link href={pathname} locale={other} className={className}>
      {t('language')}
    </Link>
  );
}
