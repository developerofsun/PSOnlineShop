import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import ShopView, { type ShopFilters } from '@/components/ShopView';
import { apiGet } from '@/lib/api';
import type { Facets, ProductsResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'products' });
  return { title: t('title') };
}

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'products' });

  // Accept both ?categories=a,b and the older single ?category=a
  const filters: ShopFilters = {
    q: one(sp.q),
    categories: (one(sp.categories) || one(sp.category)).split(',').map((s) => s.trim()).filter(Boolean),
    minPrice: one(sp.minPrice).replace(/\D/g, ''),
    maxPrice: one(sp.maxPrice).replace(/\D/g, ''),
    inStock: one(sp.inStock) === 'true',
    onSale: one(sp.onSale) === 'true',
    sort: one(sp.sort),
  };

  const qs = new URLSearchParams({ lang: locale });
  if (filters.q) qs.set('q', filters.q);
  if (filters.categories.length) qs.set('categories', filters.categories.join(','));
  if (filters.minPrice) qs.set('minPrice', filters.minPrice);
  if (filters.maxPrice) qs.set('maxPrice', filters.maxPrice);
  if (filters.inStock) qs.set('inStock', 'true');
  if (filters.onSale) qs.set('onSale', 'true');
  if (filters.sort) qs.set('sort', filters.sort);

  const [result, facets] = await Promise.all([
    apiGet<ProductsResult>(`/api/catalog/products?${qs}&page=1&pageSize=24`, 15),
    apiGet<Facets>(`/api/catalog/facets?${qs}`, 15),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <ShopView initialFilters={filters} initialResult={result} initialFacets={facets} />
    </div>
  );
}
