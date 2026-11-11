import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Aisle } from '@/components/Shop3D';
import Shop3DGate from '@/components/Shop3DGate';
import { apiGet } from '@/lib/api';
import type { CategoryItem, ProductsResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'shop3d' });
  return { title: t('title') };
}

export default async function Shop3DPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ find?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // "?find=ID": the shop assistant sent the customer here to be guided to that product
  const rawFind = (await searchParams).find;
  const parsed = Number(Array.isArray(rawFind) ? rawFind[0] : rawFind);
  const findId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  // Admin settings: the 3D store can be switched off, and can require a signed-in customer (default: required).
  const settings = await apiGet<Record<string, string | null>>('/api/settings/public', 30);
  if (settings?.['site.shop3d_enabled'] === 'false') notFound();
  const loginRequired = settings?.['site.shop3d_login_required'] !== 'false';

  const t = await getTranslations({ locale, namespace: 'shop3d' });
  const cats = (await apiGet<CategoryItem[]>(`/api/catalog/categories?lang=${locale}`, 60)) ?? [];
  const roots = cats.filter((c) => c.parentId == null).slice(0, 8);

  // One aisle per top-level category (its sub-categories' products are included by the API).
  const loaded = await Promise.all(
    roots.map(async (c) => {
      const r = await apiGet<ProductsResult>(
        `/api/catalog/products?lang=${locale}&categories=${encodeURIComponent(c.slug ?? '')}&inStock=true&pageSize=18`,
        30,
      );
      return { id: c.id, name: c.name ?? '', products: r?.items ?? [] } satisfies Aisle;
    }),
  );
  const aisles = loaded.filter((a) => a.products.length > 0);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl text-brand-800">{t('title')}</h1>
      {aisles.length === 0 ? (
        <p className="py-16 text-center text-slate-500">{t('empty')}</p>
      ) : (
        <Shop3DGate
          aisles={aisles}
          findId={findId}
          loginRequired={loginRequired}
          logoUrl={settings?.['site.logo_url'] || null}
          storeName={settings?.[`site.name.${locale}`] || t('title')}
        />
      )}
    </div>
  );
}
