import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <div className="py-20 text-center">
      <p className="mb-2 text-6xl font-bold text-slate-300">404</p>
      <Link href="/" className="btn">
        {t('home')}
      </Link>
    </div>
  );
}
