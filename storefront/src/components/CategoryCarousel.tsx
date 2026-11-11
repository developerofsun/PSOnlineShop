'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronIcon } from './icons';

/**
 * Horizontal, swipeable row of category tiles. Phones scroll by touch; on larger screens round arrows appear at the
 * edges when there is more to see. Works in RTL and LTR (scroll offsets are measured as absolute values).
 */
export default function CategoryCarousel({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const list = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const measure = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const x = Math.abs(el.scrollLeft);
    setCanPrev(x > 4);
    setCanNext(x + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    measure();
    const el = list.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  function scroll(step: 1 | -1) {
    const el = list.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: (rtl ? -1 : 1) * step * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  const arrow =
    'absolute top-6 z-10 hidden h-10 w-10 place-items-center rounded-full bg-white text-slate-700 ring-1 ring-slate-900/10 hover:text-brand-700 md:grid';

  return (
    <div className="relative">
      <ul
        ref={list}
        onScroll={measure}
        className="-mx-1 flex snap-x snap-proximity gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {canPrev && (
        <button type="button" onClick={() => scroll(-1)} aria-label={t('previous')} className={`${arrow} start-0`}>
          <ChevronIcon className="h-5 w-5 ltr:rotate-180" />
        </button>
      )}
      {canNext && (
        <button type="button" onClick={() => scroll(1)} aria-label={t('next')} className={`${arrow} end-0`}>
          <ChevronIcon className="h-5 w-5 rtl:rotate-180" />
        </button>
      )}
    </div>
  );
}
