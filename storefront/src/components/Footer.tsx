import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/** Classic multi-column store footer. The first column shows the "footer" fixed text managed in the admin. */
export default function Footer({ siteName, text }: { siteName: string; text?: string | null }) {
  const t = useTranslations('footer');
  const tc = useTranslations('common');

  const col = 'space-y-2 text-sm text-slate-300';
  const link = 'hover:text-white hover:underline';

  return (
    <footer className="mt-auto bg-slate-900 text-slate-300">
      <div className="border-t-4 border-brand-600" />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-lg font-extrabold text-white">{siteName}</p>
          <p className="whitespace-pre-line text-sm leading-7">{text || t('about')}</p>
        </div>

        <div>
          <h3 className="mb-3 font-bold text-white">{t('shop')}</h3>
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
          <h3 className="mb-3 font-bold text-white">{t('customer')}</h3>
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
          <h3 className="mb-3 font-bold text-white">{t('why')}</h3>
          <ul className={col}>
            <li>✓ {t('fresh')}</li>
            <li>✓ {t('fast')}</li>
            <li>✓ {t('secure')}</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-3 text-center text-xs text-slate-400">
        © {siteName} — {tc('footer')}
      </div>
    </footer>
  );
}
