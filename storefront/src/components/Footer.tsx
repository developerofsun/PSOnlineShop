import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** Classic multi-column store footer. The first column shows the "footer" fixed text managed in the admin. */
export default function Footer({ siteName, text, logoUrl = null }: { siteName: string; text?: string | null; logoUrl?: string | null }) {
  const t = useTranslations('footer');
  const tc = useTranslations('common');

  const col = 'space-y-2 text-sm text-slate-600';
  const link = 'hover:text-brand-700 hover:underline';

  return (
    <footer className="mt-12 border-t border-slate-200 bg-slate-100 text-slate-600">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={siteName} className="h-12 w-auto max-w-[180px] object-contain" />
          ) : (
            <p className="font-display text-2xl text-brand-700">{siteName}</p>
          )}
          <p className="whitespace-pre-line text-sm leading-7 text-slate-600">{text || t('about')}</p>
        </div>

        <div>
          <h3 className="mb-3 font-semibold text-slate-900">{t('shop')}</h3>
          <ul className={col}>
            <li>
              <Link href="/products" className={link}>
                {tc('products')}
              </Link>
            </li>
            <li>
              <Link href="/products?onSale=true" className={link}>
                {t('offers')}
              </Link>
            </li>
            <li>
              <Link href="/compare" className={link}>
                {tc('compare')}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 font-semibold text-slate-900">{t('customer')}</h3>
          <ul className={col}>
            <li>
              <Link href="/account" className={link}>
                {tc('account')}
              </Link>
            </li>
            <li>
              <Link href="/favorites" className={link}>
                {tc('favorites')}
              </Link>
            </li>
            <li>
              <Link href="/cart" className={link}>
                {tc('cart')}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 font-semibold text-slate-900">{t('why')}</h3>
          <ul className={col}>
            <li>{t('fresh')}</li>
            <li>{t('fast')}</li>
            <li>{t('secure')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        © {siteName} — {tc('footer')}
      </div>
    </footer>
  );
}
