'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCompare } from '@/lib/compare';
import { formatNumber } from '@/lib/format';
import type { ProductCompareItem } from '@/lib/types';
import AddToCart from './AddToCart';
import Price from './Price';
import ProductImage from './ProductImage';

/** Side-by-side comparison of up to 4 products. Rows whose values differ can be highlighted or shown alone. */
export default function CompareView() {
  const t = useTranslations('compare');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { ids, remove, clear } = useCompare();
  const [items, setItems] = useState<ProductCompareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffOnly, setDiffOnly] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/backend/api/catalog/products/by-ids?ids=${ids.join(',')}&lang=${locale}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProductCompareItem[]) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [ids, locale, mounted]);

  const rows = useMemo(
    () => [
      { key: 'price', label: t('price'), value: (p: ProductCompareItem) => String(p.salePrice ?? p.price), render: (p: ProductCompareItem) => <Price price={p.price} salePrice={p.salePrice} /> },
      { key: 'availability', label: t('availability'), value: (p: ProductCompareItem) => (p.stock > 0 ? 'in' : 'out'), render: (p: ProductCompareItem) => (p.stock > 0 ? tc('inStock') : tc('outOfStock')) },
      { key: 'category', label: t('category'), value: (p: ProductCompareItem) => p.categoryName ?? '', render: (p: ProductCompareItem) => p.categoryName ?? '—' },
      { key: 'sku', label: t('sku'), value: (p: ProductCompareItem) => p.sku, render: (p: ProductCompareItem) => <span dir="ltr">{p.sku}</span> },
      { key: 'description', label: t('description'), value: (p: ProductCompareItem) => p.shortDescription ?? '', render: (p: ProductCompareItem) => p.shortDescription ?? '—' },
    ],
    [t, tc],
  );

  if (!mounted || loading) return <p className="text-slate-500">{tc('loading')}</p>;

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-slate-500">{t('empty')}</p>
        <Link href="/products" className="btn">
          {tc('products')}
        </Link>
      </div>
    );
  }

  const differs = (r: (typeof rows)[number]) => new Set(items.map(r.value)).size > 1;
  const visible = diffOnly ? rows.filter(differs) : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="accent-brand-600" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
          {t('differencesOnly')}
        </label>
        <button type="button" onClick={clear} className="text-sm text-red-600 hover:underline">
          {t('clear')} ({formatNumber(items.length, locale)})
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 p-3 text-start align-bottom text-slate-500" />
              {items.map((p) => (
                <th key={p.id} className="border-s border-slate-100 p-3 align-top font-normal">
                  <button type="button" onClick={() => remove(p.id)} className="mb-2 text-xs text-red-600 hover:underline">
                    {t('remove')}
                  </button>
                  <Link href={`/products/${encodeURIComponent(p.slug ?? '')}`} className="block">
                    <ProductImage src={p.image} alt={p.name ?? p.sku} className="mx-auto aspect-square w-32 rounded-lg" />
                    <span className="mt-2 line-clamp-2 block font-medium hover:text-brand-600">{p.name ?? p.sku}</span>
                  </Link>
                  <div className="mt-2">
                    <AddToCart size="compact" productId={p.id} slug={p.slug ?? ''} name={p.name ?? p.sku} price={p.salePrice ?? p.price} image={p.image} stock={p.stock} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={differs(r) ? 'bg-amber-50/60' : ''}>
                <th className="p-3 text-start font-medium text-slate-500">{r.label}</th>
                {items.map((p) => (
                  <td key={p.id} className="border-s border-slate-100 p-3 align-top">
                    {r.render(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
