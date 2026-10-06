import { getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { apiGet } from '@/lib/api';
import type { CategoryItem } from '@/lib/types';
import CategoryNav from './CategoryNav';
import DeliveryBar from './DeliveryBar';
import HeaderActions from './HeaderActions';
import SearchBox from './SearchBox';

/** Three tiers, like a supermarket site: delivery strip, main bar (logo, search, cart), category bar. */
export default async function Header({
  siteName,
  supportText,
  shop3d = false,
}: {
  siteName: string;
  supportText?: string | null;
  shop3d?: boolean;
}) {
  const locale = await getLocale();
  const categories = (await apiGet<CategoryItem[]>(`/api/catalog/categories?lang=${locale}`, 60)) ?? [];

  return (
    <>
      <DeliveryBar supportText={supportText} />
      {/* Only the main bar sticks to the top while scrolling */}
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-brand-700">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-600 text-lg text-white" aria-hidden>
              {siteName.trim().charAt(0)}
            </span>
            <span className="hidden sm:inline">{siteName}</span>
          </Link>
          <div className="order-last flex w-full md:order-none md:w-auto md:flex-1">
            <SearchBox />
          </div>
          <div className="ms-auto md:ms-0">
            <HeaderActions />
          </div>
        </div>
      </div>
      <CategoryNav categories={categories} shop3d={shop3d} />
    </>
  );
}
