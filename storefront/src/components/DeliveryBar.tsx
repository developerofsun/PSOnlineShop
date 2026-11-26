'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocation } from '@/lib/location';
import { useUi } from '@/lib/ui';
import { PinIcon } from './icons';
import LocaleSwitcher from './LocaleSwitcher';
import { useMapSettings } from './MapSettings';

/**
 * Thin strip above the header. Everything on it is managed in the admin: the text on the left (or the
 * saved delivery address when the map is on), the note on the right and the language switcher.
 */
export default function DeliveryBar({
  supportText,
  text,
  note,
  showLanguage = true,
}: {
  /** Fixed text from Content → Texts (the first line is the fallback for the right-hand note). */
  supportText?: string | null;
  /** Custom left-hand text from Settings → Header; empty keeps the built-in "nationwide shipping". */
  text?: string | null;
  /** Custom right-hand note from Settings → Header; empty falls back to the support text. */
  note?: string | null;
  showLanguage?: boolean;
}) {
  const t = useTranslations('common');
  const map = useMapSettings();
  const lat = useLocation((s) => s.lat);
  const label = useLocation((s) => s.label);
  const setLocationOpen = useUi((s) => s.setLocationOpen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shown = mounted && lat != null ? label || t('locationSaved') : t('chooseAddress');
  const aside = note?.trim() || supportText?.split('\n')[0] || '';

  return (
    <div className="site-header-strip text-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5">
        {map.enabled ? (
          <button type="button" onClick={() => setLocationOpen(true)} className="flex min-w-0 items-center gap-1.5 hover:text-brand-700">
            <PinIcon className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="shrink-0">{t('deliverTo')}:</span>
            <b className="truncate font-semibold text-slate-800">{shown}</b>
          </button>
        ) : (
          <span className="truncate">{text?.trim() || t('shipAll')}</span>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {aside && <span className="hidden whitespace-nowrap md:inline">{aside}</span>}
          {showLanguage && <LocaleSwitcher className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200" />}
        </div>
      </div>
    </div>
  );
}
