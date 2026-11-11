'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber, toAsciiDigits } from '@/lib/format';
import type { FacetCategory, Facets, ProductListItem, ProductsResult } from '@/lib/types';
import { ChevronIcon, FilterIcon } from './icons';
import ProductCard from './ProductCard';

export type ShopFilters = {
  q: string;
  categories: string[];
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  onSale: boolean;
  sort: string;
};

export const emptyFilters: ShopFilters = { q: '', categories: [], minPrice: '', maxPrice: '', inStock: false, onSale: false, sort: '' };

const PAGE_SIZE = 24;

function toQuery(f: ShopFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.categories.length) p.set('categories', f.categories.join(','));
  if (f.minPrice) p.set('minPrice', f.minPrice);
  if (f.maxPrice) p.set('maxPrice', f.maxPrice);
  if (f.inStock) p.set('inStock', 'true');
  if (f.onSale) p.set('onSale', 'true');
  if (f.sort) p.set('sort', f.sort);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}

/** Shop page: filters and results update in place (no page reload); counts always match the current filters. */
export default function ShopView({
  initialFilters,
  initialResult,
  initialFacets,
}: {
  initialFilters: ShopFilters;
  initialResult: ProductsResult | null;
  initialFacets: Facets | null;
}) {
  const t = useTranslations('shop');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [filters, setFilters] = useState<ShopFilters>(initialFilters);
  const [items, setItems] = useState<ProductListItem[]>(initialResult?.items ?? []);
  const [total, setTotal] = useState(initialResult?.total ?? 0);
  const [fuzzy, setFuzzy] = useState(initialResult?.fuzzy ?? false);
  const [facets, setFacets] = useState<Facets | null>(initialFacets);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const first = useRef(true);
  const abort = useRef<AbortController | null>(null);

  // Refetch page 1 + facets whenever a filter changes (debounced).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoading(true);
      setError(false);
      try {
        const base = toQuery(filters, { lang: locale });
        const [pr, fr] = await Promise.all([
          fetch(`/backend/api/catalog/products?${toQuery(filters, { lang: locale, page: '1', pageSize: String(PAGE_SIZE) })}`, { signal: ctrl.signal }),
          fetch(`/backend/api/catalog/facets?${base}`, { signal: ctrl.signal }),
        ]);
        if (!pr.ok || !fr.ok) throw new Error();
        const res = (await pr.json()) as ProductsResult;
        setItems(res.items);
        setTotal(res.total);
        setFuzzy(res.fuzzy);
        setFacets((await fr.json()) as Facets);
        setPage(1);
        // Keep the URL shareable without triggering a navigation.
        const qs = toQuery(filters).toString();
        window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(true);
      } finally {
        if (abort.current === ctrl) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, locale]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const next = page + 1;
      const r = await fetch(
        `/backend/api/catalog/products?${toQuery(filters, { lang: locale, page: String(next), pageSize: String(PAGE_SIZE) })}`,
      );
      if (!r.ok) throw new Error();
      const res = (await r.json()) as ProductsResult;
      setItems((prev) => [...prev, ...res.items.filter((n) => !prev.some((p) => p.id === n.id))]);
      setPage(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, locale, page]);

  const set = (patch: Partial<ShopFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(emptyFilters);

  const chips = useMemo(() => {
    const list: { key: string; label: string; remove: () => void }[] = [];
    if (filters.q) list.push({ key: 'q', label: `“${filters.q}”`, remove: () => set({ q: '' }) });
    for (const slug of filters.categories) {
      const c = facets?.categories.find((x) => x.slug === slug);
      list.push({ key: `c-${slug}`, label: c?.name ?? slug, remove: () => set({ categories: filters.categories.filter((s) => s !== slug) }) });
    }
    if (filters.minPrice || filters.maxPrice) {
      list.push({
        key: 'price',
        label: `${filters.minPrice ? formatNumber(Number(filters.minPrice), locale) : '…'} – ${filters.maxPrice ? formatNumber(Number(filters.maxPrice), locale) : '…'}`,
        remove: () => set({ minPrice: '', maxPrice: '' }),
      });
    }
    if (filters.inStock) list.push({ key: 'stock', label: t('inStockOnly'), remove: () => set({ inStock: false }) });
    if (filters.onSale) list.push({ key: 'sale', label: t('onSaleOnly'), remove: () => set({ onSale: false }) });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, facets, locale, t]);

  const filterPanel = (
    <div className="space-y-6">
      <CategoryTree facets={facets} selected={filters.categories} onChange={(categories) => set({ categories })} title={t('categories')} />
      <PriceFilter facets={facets} min={filters.minPrice} max={filters.maxPrice} onChange={(minPrice, maxPrice) => set({ minPrice, maxPrice })} title={t('price')} />

      <div className="space-y-3">
        <Toggle label={t('inStockOnly')} count={facets?.inStockCount} checked={filters.inStock} onChange={(inStock) => set({ inStock })} locale={locale} />
        <Toggle label={t('onSaleOnly')} count={facets?.onSaleCount} checked={filters.onSale} onChange={(onSale) => set({ onSale })} locale={locale} />
      </div>

      {hasFilters && (
        <button type="button" onClick={() => setFilters(emptyFilters)} className="btn-outline w-full">
          {t('clearAll')}
        </button>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Filters: sidebar on desktop, collapsible panel on mobile */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <button type="button" onClick={() => setPanelOpen((o) => !o)} className="btn-outline mb-3 w-full gap-2 lg:hidden" aria-expanded={panelOpen}>
          <FilterIcon className="h-4 w-4" />
          {panelOpen ? t('hideFilters') : t('showFilters')}
          {chips.length > 0 && <span className="rounded-full bg-brand-600 px-2 text-xs text-white">{formatNumber(chips.length, locale)}</span>}
        </button>
        <div className={`card p-4 ${panelOpen ? 'block' : 'hidden'} lg:block`}>{filterPanel}</div>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={tc('searchPlaceholder')}
            aria-label={tc('search')}
            className="input max-w-xs"
          />
          <span className="text-sm text-slate-500" aria-live="polite">
            {t('results', { count: formatNumber(total, locale) })}
          </span>
          <label className="ms-auto flex items-center gap-2 text-sm">
            {t('sort')}
            <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })} className="input w-auto">
              <option value="">{filters.q ? t('sortRelevance') : t('sortNewest')}</option>
              <option value="newest">{t('sortNewest')}</option>
              <option value="price_asc">{t('sortPriceAsc')}</option>
              <option value="price_desc">{t('sortPriceDesc')}</option>
              <option value="discount">{t('sortDiscount')}</option>
            </select>
          </label>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={c.remove} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700 hover:bg-brand-100">
                {c.label} <span aria-hidden>×</span>
                <span className="sr-only">{t('remove')}</span>
              </button>
            ))}
          </div>
        )}

        {fuzzy && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t('fuzzy')}</p>}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{t('error')}</p>}

        {items.length > 0 ? (
          <div className={`grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity md:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-50' : ''}`}>
            {items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <p className="py-16 text-center text-slate-500">{loading ? tc('loading') : t('noResults')}</p>
        )}

        {items.length < total && (
          <div className="text-center">
            <button type="button" className="btn-outline" onClick={loadMore} disabled={loading}>
              {loading ? tc('loading') : t('loadMore', { shown: formatNumber(items.length, locale), total: formatNumber(total, locale) })}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- category tree

function CategoryTree({
  facets,
  selected,
  onChange,
  title,
}: {
  facets: Facets | null;
  selected: string[];
  onChange: (slugs: string[]) => void;
  title: string;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const cats = facets?.categories ?? [];
  const roots = cats.filter((c) => c.parentId == null);
  const childrenOf = (id: number) => cats.filter((c) => c.parentId === id);

  const isVisible = (c: FacetCategory) => c.count > 0 || (c.slug != null && selected.includes(c.slug));
  const containsSelected = (c: FacetCategory): boolean =>
    (c.slug != null && selected.includes(c.slug)) || childrenOf(c.id).some(containsSelected);

  const toggle = (slug: string | null) => {
    if (!slug) return;
    onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  };

  const renderNode = (c: FacetCategory, depth = 0): React.ReactNode => {
    if (!isVisible(c)) return null;
    const kids = childrenOf(c.id).filter(isVisible);
    const expanded = open[c.id] ?? containsSelected(c);
    return (
      <li key={c.id}>
        <div className="flex items-center gap-1" style={{ paddingInlineStart: depth * 14 }}>
          {kids.length > 0 ? (
            <button
              type="button"
              aria-label="toggle"
              aria-expanded={expanded}
              onClick={() => setOpen((o) => ({ ...o, [c.id]: !expanded }))}
              className="grid h-6 w-6 place-items-center text-slate-500"
            >
              <ChevronIcon className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : 'rtl:rotate-180'}`} />
            </button>
          ) : (
            <span className="w-6" />
          )}
          <label className="flex flex-1 cursor-pointer items-center gap-2 py-1 text-sm">
            <input type="checkbox" className="accent-brand-600" checked={c.slug != null && selected.includes(c.slug)} onChange={() => toggle(c.slug)} />
            <span className="flex-1">{c.name}</span>
            <span className="text-xs text-slate-400">{formatNumber(c.count, locale)}</span>
          </label>
        </div>
        {kids.length > 0 && expanded && <ul>{kids.map((k) => renderNode(k, depth + 1))}</ul>}
      </li>
    );
  };

  if (roots.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold">{title}</h3>
      <ul>{roots.map((r) => renderNode(r))}</ul>
    </div>
  );
}

// ---------------------------------------------------------------- price

function PriceFilter({
  facets,
  min,
  max,
  onChange,
  title,
}: {
  facets: Facets | null;
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
  title: string;
}) {
  const t = useTranslations('shop');
  const tc = useTranslations('common');
  const locale = useLocale();
  const lo = facets?.minPrice ?? 0;
  const hi = facets?.maxPrice ?? 0;
  const canSlide = hi > lo;

  const curMin = min ? Number(min) : lo;
  const curMax = max ? Number(max) : hi;
  const step = Math.max(1000, Math.round((hi - lo) / 100 / 1000) * 1000);

  const clean = (v: string) => toAsciiDigits(v).replace(/[^\d]/g, '');

  return (
    <div>
      <h3 className="mb-2 text-sm font-bold">{title}</h3>

      {canSlide && (
        <div className="dual-range mb-3" dir="ltr">
          <input
            type="range"
            min={lo}
            max={hi}
            step={step}
            value={Math.min(curMin, curMax)}
            aria-label={t('from')}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange(v <= lo ? '' : String(Math.min(v, curMax)), max);
            }}
          />
          <input
            type="range"
            min={lo}
            max={hi}
            step={step}
            value={Math.max(curMin, curMax)}
            aria-label={t('to')}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange(min, v >= hi ? '' : String(Math.max(v, curMin)));
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          inputMode="numeric"
          dir="ltr"
          className="input text-start"
          placeholder={`${t('from')} ${hi > 0 ? formatNumber(lo, locale) : ''}`}
          value={min}
          onChange={(e) => onChange(clean(e.target.value), max)}
          aria-label={t('from')}
        />
        <input
          inputMode="numeric"
          dir="ltr"
          className="input text-start"
          placeholder={`${t('to')} ${hi > 0 ? formatNumber(hi, locale) : ''}`}
          value={max}
          onChange={(e) => onChange(min, clean(e.target.value))}
          aria-label={t('to')}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">{tc('currency')}</p>
    </div>
  );
}

function Toggle({
  label,
  count,
  checked,
  onChange,
  locale,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  locale: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs text-slate-400">{formatNumber(count, locale)}</span>}
    </label>
  );
}
