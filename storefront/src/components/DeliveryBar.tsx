'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocation } from '@/lib/location';
import { useUi } from '@/lib/ui';
import { PinIcon } from './icons';
import LocaleSwitcher from './LocaleSwitcher';
import { useMapSettings } from './MapSettings';

/** Thin strip above the header: where we deliver to (click to change it on the map), support hours, language. */
export default function DeliveryBar({ supportText }: { supportText?: string | null }) {
  const t = useTranslations('common');
  const map = useMapSettings();
  const lat = useLocation((s) => s.lat);
  const label = useLocation((s) => s.label);
  const setLocationOpen = useUi((s) => s.setLocationOpen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const shown = mounted && lat != null ? label || t('locationSaved') : t('chooseAddress');

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
          <span>{t('shipAll')}</span>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {supportText && <span className="hidden whitespace-nowrap md:inline">{supportText.split('\n')[0]}</span>}
          <LocaleSwitcher className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
