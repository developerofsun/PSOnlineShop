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

  // A slide can be limited to desktop or mobile (admin → sliders). Slides that do not belong to the current
  // screen are dropped from the loop, so autoplay never stops on an invisible slide.
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const visible = slides.filter((s) => {
    const device = s.style?.device ?? 'all';
    return device === 'all' || (device === 'desktop') === isDesktop;
  });
  const count = visible.length;
  const active = count === 0 ? 0 : ((index % count) + count) % count;

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [paused, count, intervalMs]);

  const go = (i: number) => setIndex(((i + count) % count + count) % count);
  if (count === 0) return null;

  return (
    <section
      className="relative aspect-[16/6] min-h-[170px] w-full overflow-hidden rounded-xl bg-transparent"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(active + (dx < 0 ? 1 : -1));
      }}
      aria-roledescription="carousel"
    >
      {visible.map((s, i) => {
        // Every appearance option is optional: a slide saved before these existed shows everything.
        const st = s.style ?? null;
        const showText = st?.showText ?? true;
        const showButton = st?.showButton ?? true;
        const showBackground = st?.showBackground ?? true;
        const align = st?.textAlign ?? 'start';
        const justify = align === 'center' ? 'justify-center' : align === 'end' ? 'justify-end' : 'justify-start';
        const textAlign = align === 'center' ? 'text-center' : align === 'end' ? 'text-end' : 'text-start';
        const hasImage = showBackground && !!s.imageUrl;
        const flatColor = showBackground && !s.imageUrl ? (st?.backgroundColor ?? null) : null;
        const hasButton = showButton && !!s.buttonText && !!s.linkUrl;

        return (
          <div
            key={i}
            aria-hidden={i !== active}
            className={`absolute inset-0 transition-opacity duration-500 ${i === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <SmartLink href={s.linkUrl} className="block h-full w-full">
              <div
                className={`flex h-full w-full items-center bg-cover bg-center ${
                  showBackground && !hasImage && !flatColor ? FLAT[i % FLAT.length] : ''
                }`}
                style={{
                  ...(hasImage ? { backgroundImage: `url(${JSON.stringify(s.imageUrl)})` } : {}),
                  ...(flatColor ? { backgroundColor: flatColor } : {}),
                }}
              >
                {(showText || hasButton) && (
                  <div className={`flex w-full ${justify}`}>
                    <div
                      className={`max-w-lg space-y-2 p-5 sm:space-y-3 sm:p-10 ${textAlign}`}
                      style={{
                        backgroundColor: st?.overlayColor ?? (hasImage ? 'rgba(0,0,0,0.35)' : undefined),
                        color: st?.textColor ?? '#ffffff',
                      }}
                    >
                      {showText && s.title && <h2 className="font-display text-2xl leading-snug sm:text-5xl">{s.title}</h2>}
                      {showText && s.subtitle && <p className="text-sm sm:text-lg">{s.subtitle}</p>}
                      {hasButton && (
                        <span
                          className="inline-block rounded-lg px-5 py-2 text-sm font-semibold"
                          style={{
                            backgroundColor: st?.buttonColor ?? '#ffffff',
                            color: st?.buttonTextColor ?? '#1a6e2e',
                          }}
                        >
                          {s.buttonText}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </SmartLink>
          </div>
        );
      })}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label={t('previous')}
            onClick={() => go(active - 1)}
            className="absolute start-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 hover:bg-white sm:grid"
          >
            <ChevronIcon className="h-5 w-5 ltr:rotate-180" />
          </button>
          <button
            type="button"
            aria-label={t('next')}
            onClick={() => go(active + 1)}
            className="absolute end-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-700 hover:bg-white sm:grid"
          >
            <ChevronIcon className="h-5 w-5 rtl:rotate-180" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {visible.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === active}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-white' : 'w-3 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
