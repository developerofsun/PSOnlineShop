import '@fontsource-variable/vazirmatn';
import '../globals.css';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import AppBootstrap from '@/components/AppBootstrap';
import AssistantWidget from '@/components/AssistantWidget';
import CartBar from '@/components/CartBar';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import LocationPrompt from '@/components/LocationPrompt';
import { MapSettingsProvider } from '@/components/MapSettings';
import MiniCart from '@/components/MiniCart';
import PwaRegister from '@/components/PwaRegister';
import { isRtl, routing } from '@/i18n/routing';
import { apiGet } from '@/lib/api';
import { parseMapSettings } from '@/lib/mapSettings';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: '#2e8b3d', width: 'device-width', initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    title: { default: t('siteName'), template: `%s | ${t('siteName')}` },
    applicationName: t('siteName'),
    appleWebApp: { capable: true, title: t('siteName'), statusBarStyle: 'default' },
    icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'common' });

  // Managed in the admin: fixed text "footer" (Content → Texts) and site settings (name, map options).
  const [footerText, settings] = await Promise.all([
    apiGet<{ text: string | null }>(`/api/content/texts/footer?lang=${locale}`, 60),
    apiGet<Record<string, string | null>>('/api/settings/public', 30),
  ]);
  const siteName = settings?.[`site.name.${locale}`] || t('siteName');
  const mapSettings = parseMapSettings(settings);
  // Feature switches from the admin settings (on unless explicitly turned off)
  const shop3d = settings?.['site.shop3d_enabled'] !== 'false';
  const assistant = settings?.['site.assistant_enabled'] !== 'false';

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      {/* Column layout: <main> grows, so the footer sits at the bottom even on short pages.
          pb-16 keeps content clear of the mobile cart bar. */}
      <body className="flex min-h-screen flex-col pb-16 md:pb-0">
        <NextIntlClientProvider messages={messages}>
          <MapSettingsProvider value={mapSettings}>
            <Header siteName={siteName} supportText={footerText?.text} shop3d={shop3d} />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
            <Footer siteName={siteName} text={footerText?.text} />
            <MiniCart />
            <CartBar />
            <LocationPrompt />
            {assistant && <AssistantWidget />}
            <PwaRegister />
            <AppBootstrap />
          </MapSettingsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
