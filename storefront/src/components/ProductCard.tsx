import { Link } from '@/i18n/navigation';
import type { ProductListItem } from '@/lib/types';
import AddToCart from './AddToCart';
import Price from './Price';
import ProductImage from './ProductImage';
import { CompareButton, FavButton } from './ProductToggles';

/** Borderless product tile: the picture sits on a soft well, everything else is just text on the page. */
export default function ProductCard({ product }: { product: ProductListItem }) {
  const name = product.name ?? product.sku;
  const href = `/products/${encodeURIComponent(product.slug ?? '')}`;

  return (
    <div className="group relative flex flex-col">
      <div className="absolute end-2 top-2 z-10 flex flex-col gap-1.5">
        <FavButton productId={product.id} />
        <CompareButton productId={product.id} />
      </div>

      <Link href={href} className="block">
        <ProductImage src={product.image} alt={name} className="aspect-square w-full rounded-xl transition-opacity group-hover:opacity-90" />
        <h3 className="mt-2.5 line-clamp-2 min-h-[2.8rem] text-sm leading-[1.4rem] text-slate-800 group-hover:text-brand-700">
          {name}
        </h3>
      </Link>

      <div className="mt-auto space-y-2.5 pt-2">
        <div className="min-h-[2.75rem]">
          <Price price={product.price} salePrice={product.salePrice} />
        </div>
        <AddToCart
          size="compact"
          productId={product.id}
          slug={product.slug ?? ''}
          name={name}
          price={product.salePrice ?? product.price}
          image={product.image}
          stock={product.stock}
        />
      </div>
    </div>
  );
}
