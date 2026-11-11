import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <div className="py-20 text-center">
      <p className="mb-4 font-display text-8xl text-slate-300">404</p>
      <Link href="/" className="btn">
        {t('home')}
      </Link>
    </div>
  );
}
