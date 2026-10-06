'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocation } from '@/lib/location';
import { useUi } from '@/lib/ui';
import { useMapSettings } from './MapSettings';
import type { LatLng } from './MapPicker';
import MapPickerLoader from './MapPickerLoader';

/**
 * Asks the customer for their delivery point on the first visit (when enabled in the admin settings) and whenever
 * "change address" is pressed. The answer is stored in the browser and sent with the order.
 */
export default function LocationPrompt() {
  const t = useTranslations('location');
  const map = useMapSettings();
  const saved = useLocation();
  const open = useUi((s) => s.locationOpen);
  const setOpen = useUi((s) => s.setLocationOpen);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [text, setText] = useState('');
  const [geoState, setGeoState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // First visit: ask once, unless the customer already chose or pressed "later".
  useEffect(() => {
    if (mounted && map.enabled && saved.lat == null && !saved.skipped) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, map.enabled]);

  // Every time the dialog opens, start from what is saved.
  useEffect(() => {
    if (!open) return;
    setPoint(saved.lat != null && saved.lng != null ? { lat: saved.lat, lng: saved.lng } : null);
    setText(saved.label);
    setGeoState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && later();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!map.enabled || !open) return null;

  function later() {
    if (saved.lat == null) saved.skip();
    setOpen(false);
  }

  function confirm() {
    if (!point) return;
    saved.set(point.lat, point.lng, text.trim());
    setOpen(false);
  }

  function locateMe() {
    if (!navigator.geolocation) return setGeoState('error');
    setGeoState('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState('idle');
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && later()}>
      <div role="dialog" aria-modal="true" aria-labelledby="loc-title" className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-4 sm:rounded-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="loc-title" className="text-lg font-bold">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
          </div>
          <button type="button" onClick={later} aria-label={t('later')} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xl text-slate-500 hover:bg-slate-100">
            ×
          </button>
        </div>

        <MapPickerLoader
          value={point}
          onChange={setPoint}
          tileUrl={map.tileUrl}
          center={{ lat: map.centerLat, lng: map.centerLng }}
          zoom={map.zoom}
        />
        <p className="mt-1 text-xs text-slate-500">{point ? t('pinned') : t('tapMap')}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-outline" onClick={locateMe} disabled={geoState === 'busy'}>
            {geoState === 'busy' ? t('locating') : t('useMyLocation')}
          </button>
          {geoState === 'error' && <span className="text-xs text-red-600">{t('geoError')}</span>}
        </div>

        <label className="mt-3 block space-y-1 text-sm">
          <span>{t('addressLabel')}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={200} className="input" placeholder={t('addressHint')} />
        </label>

        <div className="mt-4 flex gap-2">
          <button type="button" className="btn flex-1" disabled={!point} onClick={confirm}>
            {t('confirm')}
          </button>
          <button type="button" className="btn-outline" onClick={later}>
            {t('later')}
          </button>
        </div>
      </div>
    </div>
  );
}
