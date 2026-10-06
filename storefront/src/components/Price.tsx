import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '@/lib/format';

/** Current price, and when discounted: the old price struck through and a red percentage badge. */
export default function Price({
  price,
  salePrice,
  size = 'md',
}: {
  price: number;
  salePrice: number | null;
  size?: 'md' | 'lg';
}) {
  const locale = useLocale();
  const t = useTranslations('common');
  const onSale = salePrice != null && salePrice < price;
  const current = onSale ? salePrice : price;
  const percent = onSale ? Math.round(((price - salePrice) / price) * 100) : 0;

  return (
    <span className="inline-flex flex-col leading-tight">
      {onSale && (
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{formatNumber(percent, locale)}٪</span>
          <span className="text-xs text-slate-400 line-through">{formatNumber(price, locale)}</span>
        </span>
      )}
      <span className={`font-bold text-slate-900 ${size === 'lg' ? 'text-xl' : 'text-[15px]'}`}>
        {formatNumber(current, locale)} <span className="text-xs font-normal text-slate-500">{t('currency')}</span>
      </span>
    </span>
  );
}
