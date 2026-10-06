'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import type { SuggestResult } from '@/lib/types';
import { SearchIcon } from './icons';
import ProductImage from './ProductImage';

type Row =
  | { kind: 'product'; href: string; label: string; image: string | null; price: number }
  | { kind: 'category'; href: string; label: string };

/** Search-as-you-type: products and categories appear while typing (debounced, cancellable). */
export default function SearchBox() {
  const t = useTranslations('search');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/backend/api/catalog/suggest?q=${encodeURIComponent(term)}&lang=${locale}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as SuggestResult;
        setRows([
          ...data.categories.map<Row>((c) => ({
            kind: 'category',
            href: `/products?categories=${encodeURIComponent(c.slug ?? '')}`,
            label: c.name ?? '',
          })),
          ...data.products.map<Row>((p) => ({
            kind: 'product',
            href: `/products/${encodeURIComponent(p.slug ?? '')}`,
            label: p.name ?? p.sku,
            image: p.image,
            price: p.salePrice ?? p.price,
          })),
        ]);
        setActive(-1);
        setBusy(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setBusy(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, locale]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (active >= 0 && rows[active]) return go(rows[active].href);
    if (term) go(`/products?q=${encodeURIComponent(term)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={box} className="relative w-full max-w-2xl">
      <form onSubmit={onSubmit} role="search" className="relative flex h-10">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={tc('searchPlaceholder')}
          aria-label={tc('search')}
          aria-autocomplete="list"
          aria-expanded={showPanel}
          className="input h-10 rounded-e-none border-e-0 bg-slate-50"
        />
        {busy && (
          <span className="pointer-events-none absolute end-14 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        )}
        <button type="submit" className="btn h-10 rounded-s-none px-4" aria-label={tc('search')}>
          <SearchIcon className="h-5 w-5" />
        </button>
      </form>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {rows.length === 0 && !busy && <p className="p-4 text-sm text-slate-500">{t('noResults')}</p>}

          <ul role="listbox">
            {rows.map((r, i) => (
              <li key={r.href + i} role="option" aria-selected={i === active}>
                <Link
                  href={r.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 text-sm ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                >
                  {r.kind === 'product' ? (
                    <>
                      <ProductImage src={r.image} alt={r.label} className="h-10 w-10 shrink-0 rounded-md" />
                      <span className="line-clamp-1 flex-1">{r.label}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatNumber(r.price, locale)} {tc('currency')}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500">#</span>
                      <span className="flex-1">{r.label}</span>
                      <span className="text-xs text-brand-600">{t('category')}</span>
                    </>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => go(`/products?q=${encodeURIComponent(q.trim())}`)}
            className="block w-full border-t border-slate-100 px-3 py-2 text-start text-sm text-brand-600 hover:bg-slate-50"
          >
            {t('seeAll', { q: q.trim() })}
          </button>
        </div>
      )}
    </div>
  );
}
