import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import AddToCart from '@/components/AddToCart';
import Price from '@/components/Price';
import ProductImage from '@/components/ProductImage';
import { CompareButton, FavButton } from '@/components/ProductToggles';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { apiGet } from '@/lib/api';
import type { ProductDetail } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; slug: string }> };

const load = (slug: string, locale: string) =>
  apiGet<ProductDetail>(`/api/catalog/products/${encodeURIComponent(decodeURIComponent(slug))}?lang=${locale}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await load(slug, locale);
  if (!p) return {};
  return {
    title: p.seoTitle || p.name,
    description: p.seoDescription || p.shortDescription || undefined,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.filter((l) => p.alternates[l]).map((l) => [l, `/${l}/products/${encodeURIComponent(p.alternates[l])}`]),
      ),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await load(slug, locale);
  if (!p) notFound();
  const t = await getTranslations({ locale, namespace: 'products' });
  const tc = await getTranslations({ locale, namespace: 'common' });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    description: p.shortDescription ?? undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'IRT',
      price: p.salePrice ?? p.price,
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <article className="grid gap-8 md:grid-cols-2">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div className="space-y-3">
        <ProductImage src={p.images[0] ?? null} alt={p.name} className="aspect-square w-full rounded-md border border-slate-200 bg-white" />
        {p.images.length > 1 && (
          <div className="grid grid-cols-5 gap-2">
            {p.images.slice(1, 6).map((src) => (
              <ProductImage key={src} src={src} alt={p.name} className="aspect-square w-full rounded border border-slate-200 bg-white" />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {p.category && (
          <Link
            href={`/products?category=${encodeURIComponent(p.category.slug ?? '')}`}
            className="text-sm text-brand-600 hover:underline"
          >
            {p.category.name}
          </Link>
        )}
        <h1 className="text-2xl font-bold">{p.name}</h1>
        <div className="text-lg">
          <Price size="lg" price={p.price} salePrice={p.salePrice} />
        </div>
        <p className="text-sm text-slate-500">
          {t('sku')}: {p.sku} · {p.stock > 0 ? tc('inStock') : tc('outOfStock')}
        </p>
        {p.shortDescription && <p className="text-slate-700">{p.shortDescription}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <AddToCart productId={p.id} slug={p.slug} name={p.name} price={p.salePrice ?? p.price} image={p.images[0] ?? null} stock={p.stock} />
          <FavButton productId={p.id} className="h-11 w-11" />
          <CompareButton productId={p.id} className="h-11 w-11" />
        </div>
        {p.description && (
          // Description is plain text here. If you later allow HTML from the admin editor, sanitize it first.
          <div className="whitespace-pre-line border-t border-slate-200 pt-4 text-slate-700">{p.description}</div>
        )}
      </div>
    </article>
  );
}
