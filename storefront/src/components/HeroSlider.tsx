'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SlideDto } from '@/lib/types';
import { ChevronIcon } from './icons';
import SmartLink from './SmartLink';

// Flat solid colors for slides without an image (no gradients).
const FLAT = ['bg-brand-600', 'bg-accent-500', 'bg-brand-800'];

/** Rectangular banner slider: cross-fade, autoplay (paused on hover), square arrows, swipe. Works in RTL and LTR. */
export default function HeroSlider({ slides, intervalMs = 5500 }: { slides: SlideDto[]; intervalMs?: number }) {
  const t = useTranslations('common');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const count = slides.length;

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [paused, count, intervalMs]);

  const go = (i: number) => setIndex((i + count) % count);

  return (
    <section
      className="relative aspect-[16/6] min-h-[170px] w-full overflow-hidden rounded-xl bg-slate-200"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
      }}
      aria-roledescription="carousel"
    >
      {slides.map((s, i) => (
        <div
          key={i}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-500 ${i === index ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <SmartLink href={s.linkUrl} className="block h-full w-full">
            <div
              className={`flex h-full w-full items-center bg-cover bg-center ${s.imageUrl ? '' : FLAT[i % FLAT.length]}`}
              style={s.imageUrl ? { backgroundImage: `url(${JSON.stringify(s.imageUrl)})` } : undefined}
            >
              {(s.title || s.subtitle || s.buttonText) && (
                <div className={`max-w-lg space-y-2 p-5 text-white sm:space-y-3 sm:p-10 ${s.imageUrl ? 'bg-black/35' : ''}`}>
                  {s.title && <h2 className="font-display text-2xl leading-snug sm:text-5xl">{s.title}</h2>}
                  {s.subtitle && <p className="text-sm sm:text-lg">{s.subtitle}</p>}
                  {s.buttonText && s.linkUrl && (
                    <span className="inline-block rounded-lg bg-white px-5 py-2 text-sm font-semibold text-brand-800">{s.buttonText}</span>
                  )}
                </div>
              )}
            </div>
          </SmartLink>
        </div>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label={t('previous')}
            onClick={() => go(index - 1)}
            className="absolute start-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 hover:bg-white sm:grid"
          >
            <ChevronIcon className="h-5 w-5 ltr:rotate-180" />
          </button>
          <button
            type="button"
            aria-label={t('next')}
            onClick={() => go(index + 1)}
            className="absolute end-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 hover:bg-white sm:grid"
          >
            <ChevronIcon className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-3 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
