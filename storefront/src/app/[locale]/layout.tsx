import '@fontsource-variable/estedad';
import '@fontsource-variable/vazirmatn'; // fallback for any glyph Estedad lacks
import '../globals.css';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import AppBootstrap from '@/components/AppBootstrap';
import AssistantWidget from '@/components/AssistantWidget';
import CartBar from '@/components/CartBar';
import DesignedFooter, { type PublicFooter } from '@/components/DesignedFooter';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import LocationPrompt from '@/components/LocationPrompt';
import { MapSettingsProvider } from '@/components/MapSettings';
import MiniCart from '@/components/MiniCart';
import PwaRegister from '@/components/PwaRegister';
import SearchDialog from '@/components/SearchDialog';
import { isRtl, routing } from '@/i18n/routing';
import { apiGet } from '@/lib/api';
import { parseMapSettings } from '@/lib/mapSettings';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = { themeColor: '#28a745', width: 'device-width', initialScale: 1 };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common' });
  return {
    title: { default: t('siteName'), template: `%s | ${t('siteName')}` },
    applicationName: t('siteName'),
    appleWebApp: { capable: true, title: t('siteName'), statusBarStyle: 'default' },
    // /favicon.ico serves the icon uploaded in the admin settings, or the bundled one (see app/favicon.ico/route.ts).
    icons: { icon: '/favicon.ico', apple: '/favicon.ico' },
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
  const [footerText, settings, designedFooter] = await Promise.all([
    apiGet<{ text: string | null }>(`/api/content/texts/footer?lang=${locale}`, 60),
    apiGet<Record<string, string | null>>('/api/settings/public', 30),
    apiGet<PublicFooter>(`/api/content/footer?lang=${locale}`, 30),
  ]);
  const siteName = settings?.[`site.name.${locale}`] || t('siteName');
  const mapSettings = parseMapSettings(settings);
  // Feature switches from the admin settings (on unless explicitly turned off)
  const shop3d = settings?.['site.shop3d_enabled'] !== 'false';
  const assistant = settings?.['site.assistant_enabled'] !== 'false';
  const logoUrl = settings?.['site.logo_url'] || null; // chosen by the admin (Settings → Site information)

  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      {/* Column layout: <main> grows, so the footer sits at the bottom even on short pages.
          pb-16 keeps content clear of the mobile cart bar. */}
      {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly...) inject attributes into <body> */}
      <body suppressHydrationWarning className="flex min-h-screen flex-col pb-16 md:pb-0">
        <NextIntlClientProvider messages={messages}>
          <MapSettingsProvider value={mapSettings}>
            <Header siteName={siteName} supportText={footerText?.text} shop3d={shop3d} logoUrl={logoUrl} />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
            {/* The footer designer (admin → Content → Footer designer) takes over once it has been saved and is active. */}
            {designedFooter ? (
              <DesignedFooter footer={designedFooter} siteName={siteName} logoUrl={logoUrl} />
            ) : (
              <Footer siteName={siteName} text={footerText?.text} logoUrl={logoUrl} />
            )}
            <MiniCart />
            <SearchDialog />
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
