import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { BlockDto, CategoryItem } from '@/lib/types';
import CategoryCarousel from './CategoryCarousel';
import HeroSlider from './HeroSlider';
import ProductCard from './ProductCard';
import SmartLink from './SmartLink';

function CategoryTile({ c }: { c: CategoryItem }) {
  return (
    <Link
      href={`/products?categories=${encodeURIComponent(c.slug ?? '')}`}
      className="group flex h-full flex-col items-center gap-2 rounded-xl p-2 text-center transition-colors hover:bg-slate-100"
    >
      {c.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imageUrl} alt="" loading="lazy" className="h-16 w-16 rounded-full bg-slate-100 object-cover sm:h-20 sm:w-20" />
      ) : (
        <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 font-display text-3xl text-brand-600 sm:h-20 sm:w-20" aria-hidden>
          {(c.name ?? '?').trim().charAt(0)}
        </span>
      )}
      <span className="text-[13px] leading-5 group-hover:text-brand-700">{c.name}</span>
    </Link>
  );
}

/** Blocks limited to one kind of screen are hidden with CSS, so the page stays a server component. */
const deviceClass = (device: BlockDto['device']) =>
  device === 'desktop' ? 'hidden md:block' : device === 'mobile' ? 'md:hidden' : '';

/** Renders the blocks of a CMS page in order. Each block type maps to one section. */
export default function BlockRenderer({ blocks }: { blocks: BlockDto[] }) {
  const t = useTranslations('home');

  return (
    <div className="space-y-12">
      {blocks.map((b) => {
        let node: React.ReactNode = null;

        switch (b.type) {
          case 'slider':
            node = <HeroSlider slides={b.data.slides} />;
            break;

          case 'banner':
            node = (
              <SmartLink href={b.data.linkUrl} className="block overflow-hidden rounded-xl">
                <div
                  className={`flex min-h-[110px] items-center bg-cover bg-center p-6 text-white sm:min-h-[150px] sm:p-10 ${b.data.imageUrl ? '' : 'bg-accent-500'}`}
                  style={b.data.imageUrl ? { backgroundImage: `url(${JSON.stringify(b.data.imageUrl)})` } : undefined}
                >
                  {b.data.title && <h2 className="font-display text-2xl sm:text-4xl">{b.data.title}</h2>}
                </div>
              </SmartLink>
            );
            break;

          case 'text':
            node = b.data.text ? (
              <section className="mx-auto max-w-3xl whitespace-pre-line border-s-4 border-accent-500 ps-5 leading-8 text-slate-700">
                {b.data.text}
              </section>
            ) : null;
            break;

          case 'categories':
            node = (
              <section>
                {b.data.title && (
                  <div className="section-title mb-3">
                    <h2>{b.data.title}</h2>
                  </div>
                )}
                <CategoryCarousel>
                  {b.data.items.map((c) => (
                    <li key={c.id} className="w-[88px] shrink-0 snap-start sm:w-[104px]">
                      <CategoryTile c={c} />
                    </li>
                  ))}
                </CategoryCarousel>
              </section>
            );
            break;

          case 'products':
            node = (
              <section>
                <div className="section-title mb-3">
                  <h2>{b.data.title ?? ''}</h2>
                  <Link
                    href={b.data.categorySlug ? `/products?categories=${encodeURIComponent(b.data.categorySlug)}` : '/products'}
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {t('viewAll')}
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                  {b.data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            );
            break;
        }

        const className = deviceClass(b.device);
        if (!node) return null;
        return className ? (
          <div key={b.id} className={className}>
            {node}
          </div>
        ) : (
          <div key={b.id}>{node}</div>
        );
      })}
    </div>
  );
}
