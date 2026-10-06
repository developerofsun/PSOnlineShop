'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useFavorites } from '@/lib/favorites';
import type { ProductCompareItem } from '@/lib/types';
import ProductCard from './ProductCard';

export default function FavoritesView() {
  const t = useTranslations('favorites');
  const tc = useTranslations('common');
  const locale = useLocale();
  const ids = useFavorites((s) => s.ids);
  const [items, setItems] = useState<ProductCompareItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    fetch(`/backend/api/catalog/products/by-ids?ids=${ids.slice(0, 24).join(',')}&lang=${locale}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProductCompareItem[]) => setItems(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [ids, locale, mounted]);

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

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
