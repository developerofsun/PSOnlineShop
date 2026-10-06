import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { BlockDto, CategoryItem } from '@/lib/types';
import HeroSlider from './HeroSlider';
import ProductCard from './ProductCard';
import SmartLink from './SmartLink';

function CategoryTile({ c }: { c: CategoryItem }) {
  return (
    <Link
      href={`/products?categories=${encodeURIComponent(c.slug ?? '')}`}
      className="group flex flex-col items-center gap-2 rounded-md border border-slate-200 bg-white p-3 text-center transition-colors hover:border-brand-500"
    >
      {c.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imageUrl} alt="" loading="lazy" className="h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20" />
      ) : (
        <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-2xl font-extrabold text-brand-600 sm:h-20 sm:w-20" aria-hidden>
          {(c.name ?? '?').trim().charAt(0)}
        </span>
      )}
      <span className="text-[13px] font-medium leading-5 group-hover:text-brand-700">{c.name}</span>
    </Link>
  );
}

/** Renders the blocks of a CMS page in order. Each block type maps to one section. */
export default function BlockRenderer({ blocks }: { blocks: BlockDto[] }) {
  const t = useTranslations('home');

  return (
    <div className="space-y-8">
      {blocks.map((b) => {
        switch (b.type) {
          case 'slider':
            return <HeroSlider key={b.id} slides={b.data.slides} />;

          case 'banner':
            return (
              <SmartLink key={b.id} href={b.data.linkUrl} className="block overflow-hidden rounded-md">
                <div
                  className={`flex min-h-[110px] items-center bg-cover bg-center p-6 text-white sm:min-h-[150px] sm:p-10 ${b.data.imageUrl ? '' : 'bg-accent-500'}`}
                  style={b.data.imageUrl ? { backgroundImage: `url(${JSON.stringify(b.data.imageUrl)})` } : undefined}
                >
                  {b.data.title && <h2 className="text-xl font-extrabold sm:text-3xl">{b.data.title}</h2>}
                </div>
              </SmartLink>
            );

          case 'text':
            return b.data.text ? (
              <section key={b.id} className="card mx-auto max-w-3xl whitespace-pre-line p-5 text-center leading-8 text-slate-700">
                {b.data.text}
              </section>
            ) : null;

          case 'categories':
            return (
              <section key={b.id}>
                {b.data.title && (
                  <div className="section-title mb-4">
                    <h2 className="text-lg font-extrabold">{b.data.title}</h2>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {b.data.items.map((c) => (
                    <CategoryTile key={c.id} c={c} />
                  ))}
                </div>
              </section>
            );

          case 'products':
            return (
              <section key={b.id}>
                <div className="section-title mb-4">
                  <h2 className="text-lg font-extrabold">{b.data.title ?? ''}</h2>
                  <Link
                    href={b.data.categorySlug ? `/products?categories=${encodeURIComponent(b.data.categorySlug)}` : '/products'}
                    className="text-sm font-bold text-brand-700 hover:underline"
                  >
                    {t('viewAll')}
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {b.data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
