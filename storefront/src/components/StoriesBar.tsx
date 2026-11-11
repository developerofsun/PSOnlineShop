'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StoryGroup } from '@/lib/types';
import { CloseIcon } from './icons';
import SmartLink from './SmartLink';

const SEEN_KEY = 'onshop-stories-seen';
const FLAT = ['bg-brand-600', 'bg-accent-500', 'bg-brand-800', 'bg-slate-700'];
/** A group counts as new again when its number of items changes. */
const sig = (g: StoryGroup) => `${g.id}:${g.items.length}`;

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Instagram-style story circles. Tap one to open the full-screen viewer. Managed in the admin (Content → Stories). */
export default function StoriesBar({ groups }: { groups: StoryGroup[] }) {
  const t = useTranslations('stories');
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => setSeen(readSeen()), []);

  const markSeen = useCallback((g: StoryGroup) => {
    setSeen((prev) => {
      if (prev.includes(sig(g))) return prev;
      const next = [...prev, sig(g)].slice(-100);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked: the ring just stays highlighted */
      }
      return next;
    });
  }, []);

  if (groups.length === 0) return null;

  return (
    <>
      <section aria-label={t('title')} className="py-1">
        <ul className="flex gap-4 overflow-x-auto pb-1">
          {groups.map((g, i) => {
            const isSeen = seen.includes(sig(g));
            return (
              <li key={g.id} className="shrink-0">
                <button type="button" onClick={() => setOpen(i)} className="flex w-[72px] flex-col items-center gap-1.5">
                  <span className={`grid h-[68px] w-[68px] place-items-center rounded-full border-2 p-[2px] ${isSeen ? 'border-slate-300' : 'border-brand-600'}`}>
                    {g.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.coverUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <span className={`grid h-full w-full place-items-center rounded-full font-display text-2xl text-white ${FLAT[i % FLAT.length]}`} aria-hidden>
                        {(g.title ?? '?').trim().charAt(0)}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-1 w-full text-center text-xs text-slate-700">{g.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {open !== null && <StoryViewer groups={groups} start={open} onSeen={markSeen} onClose={() => setOpen(null)} />}
    </>
  );
}

function StoryViewer({
  groups,
  start,
  onSeen,
  onClose,
}: {
  groups: StoryGroup[];
  start: number;
  onSeen: (g: StoryGroup) => void;
  onClose: () => void;
}) {
  const t = useTranslations('stories');
  const [gi, setGi] = useState(start);
  const [ii, setIi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const downAt = useRef(0);

  const group = groups[gi];
  const item = group.items[ii];

  const next = useCallback(() => {
    setProgress(0);
    if (ii < group.items.length - 1) return setIi(ii + 1);
    onSeen(group);
    if (gi < groups.length - 1) {
      setGi(gi + 1);
      setIi(0);
    } else onClose();
  }, [ii, gi, group, groups.length, onSeen, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (ii > 0) return setIi(ii - 1);
    if (gi > 0) {
      setGi(gi - 1);
      setIi(0);
    }
  }, [ii, gi]);

  // Auto-advance
  useEffect(() => {
    if (paused) return;
    const step = 50;
    const id = setInterval(() => {
      setProgress((p) => {
        const np = p + step / (item.durationSec * 1000);
        return np >= 1 ? 1 : np;
      });
    }, step);
    return () => clearInterval(id);
  }, [paused, item]);

  useEffect(() => {
    if (progress >= 1) next();
  }, [progress, next]);

  // Keyboard + scroll lock
  useEffect(() => {
    const rtl = document.documentElement.dir === 'rtl';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') (rtl ? prev : next)();
      else if (e.key === 'ArrowLeft') (rtl ? next : prev)();
    };
    document.addEventListener('keydown', onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = old;
    };
  }, [next, prev, onClose]);

  const hold = {
    onPointerDown: () => {
      downAt.current = Date.now();
      setPaused(true);
    },
    onPointerUp: () => setPaused(false),
    onPointerLeave: () => setPaused(false),
  };
  // A long press only pauses; it must not also count as a tap.
  const tap = (fn: () => void) => () => {
    if (Date.now() - downAt.current < 300) fn();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={group.title ?? t('title')}>
      <div className="relative h-full w-full max-w-md overflow-hidden bg-slate-900 sm:h-[92vh] sm:rounded-lg">
        {/* background */}
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className={`absolute inset-0 ${FLAT[(gi + ii) % FLAT.length]}`} />
        )}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" aria-hidden />

        {/* progress bars */}
        <div className="absolute inset-x-3 top-3 z-20 flex gap-1" aria-hidden>
          {group.items.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-sm bg-white/35">
              <div className="h-full bg-white" style={{ width: `${i < ii ? 100 : i === ii ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>

        <div className="absolute inset-x-3 top-7 z-20 flex items-center justify-between text-white">
          <span className="text-sm font-bold drop-shadow">{group.title}</span>
          <button type="button" onClick={onClose} aria-label={t('close')} className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/20">
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        {/* tap zones: start third = back, the rest = forward (mirrors automatically in RTL) */}
        <button type="button" aria-label={t('prev')} className="absolute inset-y-16 start-0 z-10 w-1/3" {...hold} onClick={tap(prev)} />
        <button type="button" aria-label={t('next')} className="absolute inset-y-16 end-0 z-10 w-2/3" {...hold} onClick={tap(next)} />

        {/* caption + link */}
        {(item.caption || item.linkUrl) && (
          <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/70 to-transparent p-5 pb-6 text-white">
            {item.caption && <p className="whitespace-pre-line text-xl font-extrabold leading-8 drop-shadow">{item.caption}</p>}
            {item.linkUrl && (
              <SmartLink href={item.linkUrl} className="inline-block rounded-md bg-white px-5 py-2 text-sm font-bold text-brand-800">
                {t('open')}
              </SmartLink>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
