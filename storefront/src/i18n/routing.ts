import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fa', 'en'],
  defaultLocale: 'fa',
  // Persian is the main language: never auto-switch based on the browser's Accept-Language.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/** Locales written right-to-left. Add 'ar' here when Arabic is introduced. */
export const RTL_LOCALES: string[] = ['fa'];

export const isRtl = (locale: string) => RTL_LOCALES.includes(locale);
