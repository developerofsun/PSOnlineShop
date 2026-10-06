import { getTranslations, setRequestLocale } from 'next-intl/server';
import AuthForm from '@/components/AuthForm';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'auth' });
  return (
    <div className="space-y-4">
      <h1 className="text-center text-2xl font-bold">{t('title')}</h1>
      <AuthForm />
    </div>
  );
}
