import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import BlockRenderer from '@/components/BlockRenderer';
import { routing } from '@/i18n/routing';
import { apiGet } from '@/lib/api';
import type { PublicPage } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; slug: string }> };

const load = (slug: string, locale: string) =>
  apiGet<PublicPage>(`/api/content/pages/${encodeURIComponent(decodeURIComponent(slug))}?lang=${locale}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await load(slug, locale);
  if (!page) return {};
  return {
    title: page.seoTitle || page.title,
    description: page.seoDescription || undefined,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.filter((l) => page.alternates[l]).map((l) => [l, `/${l}/p/${encodeURIComponent(page.alternates[l])}`]),
      ),
    },
  };
}

export default async function CmsPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const page = await load(slug, locale);
  if (!page) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{page.title}</h1>
      <BlockRenderer blocks={page.blocks} />
    </div>
  );
}
