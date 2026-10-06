import { getTranslations, setRequestLocale } from 'next-intl/server';
import BlockRenderer from '@/components/BlockRenderer';
import Recommendations from '@/components/Recommendations';
import StoriesSection from '@/components/StoriesSection';
import { apiGet } from '@/lib/api';
import type { BlockDto, CategoryItem, ProductsResult, PublicPage } from '@/lib/types';

export const dynamic = 'force-dynamic'; // data is cached per-request via fetch revalidate, not at build time

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 1) A page marked "home" in the admin (blocks: sliders, banners, products...) wins.
  const home = await apiGet<PublicPage>(`/api/content/home?lang=${locale}`);
  let blocks: BlockDto[] = home?.blocks ?? [];

  // 2) Otherwise build a sensible grocery home from the catalog itself.
  if (blocks.length === 0) {
    const t = await getTranslations({ locale, namespace: 'home' });
    const [categories, deals, latest] = await Promise.all([
      apiGet<CategoryItem[]>(`/api/catalog/categories?lang=${locale}`),
      apiGet<ProductsResult>(`/api/catalog/products?lang=${locale}&onSale=true&sort=discount&pageSize=5`),
      apiGet<ProductsResult>(`/api/catalog/products?lang=${locale}&pageSize=10`),
    ]);
    const roots = (categories ?? []).filter((c) => c.parentId == null);
    if (roots.length) blocks.push({ id: -1, type: 'categories', data: { title: t('categories'), items: roots } });
    if (deals?.items.length) blocks.push({ id: -2, type: 'products', data: { title: t('deals'), categorySlug: null, items: deals.items } });
    if (latest?.items.length) blocks.push({ id: -3, type: 'products', data: { title: t('latest'), categorySlug: null, items: latest.items } });
  }

  return (
    <div className="space-y-8">
      {/* Stories on top, managed in the admin (Content → Stories) */}
      <StoriesSection locale={locale} />
      <BlockRenderer blocks={blocks} />
      {/* Personalized rows: buy again / for you / popular */}
      <Recommendations />
    </div>
  );
}
