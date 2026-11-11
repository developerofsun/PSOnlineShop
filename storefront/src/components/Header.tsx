import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { apiGet } from '@/lib/api';
import type { CategoryItem } from '@/lib/types';
import CategoryNav from './CategoryNav';
import DeliveryBar from './DeliveryBar';
import HeaderActions from './HeaderActions';
import { headerVars, parseHeaderStyle } from './headerStyle';
import SearchBox from './SearchBox';

/** Three tiers, like a supermarket site: delivery strip, main bar (logo, search, cart), category bar. */
export default async function Header({
  siteName,
  supportText,
  shop3d = false,
  logoUrl = null,
}: {
  siteName: string;
  supportText?: string | null;
  shop3d?: boolean;
  /** Local /uploads/... image chosen in the admin settings; without it the first letter of the name is shown. */
  logoUrl?: string | null;
}) {
  const locale = await getLocale();
  const [categories, settings] = await Promise.all([
    apiGet<CategoryItem[]>(`/api/catalog/categories?lang=${locale}`, 60).then((c) => c ?? []),
    apiGet<Record<string, string | null>>('/api/settings/public', 30),
  ]);
  const style = parseHeaderStyle(settings ?? null);
  const searchFixed = style.searchWidth > 0;

  return (
    // Sizes and colours come from the admin (Settings → Header); the CSS variables are read in globals.css.
    <div className="site-header" style={headerVars(style)}>
      <DeliveryBar supportText={supportText} />
      {/* Only the main bar sticks to the top while scrolling */}
      <div className="site-header-bar sticky top-0 z-40 border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-display text-[1.7rem] leading-none text-brand-700" aria-label={siteName}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="site-header-logo-img w-auto max-w-[200px] object-contain" />
            ) : null}
            <span className={logoUrl ? 'hidden lg:inline' : ''}>{siteName}</span>
          </Link>
          <div
            className={`site-header-search hidden md:flex ${searchFixed ? '' : 'md:flex-1'}`}
            data-hdr-search={searchFixed ? 'fixed' : 'flex'}
          >
            <SearchBox />
          </div>
          <div className="ms-auto md:ms-0">
            <HeaderActions />
          </div>
        </div>
      </div>
      <CategoryNav categories={categories} shop3d={shop3d} />
    </div>
  );
}
