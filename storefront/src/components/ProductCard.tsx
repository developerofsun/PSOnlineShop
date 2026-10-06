import { Link } from '@/i18n/navigation';
import type { ProductListItem } from '@/lib/types';
import AddToCart from './AddToCart';
import Price from './Price';
import ProductImage from './ProductImage';
import { CompareButton, FavButton } from './ProductToggles';

/** Flat grocery-style card: image, two-line name, price block, and the add/quantity control at the bottom. */
export default function ProductCard({ product }: { product: ProductListItem }) {
  const name = product.name ?? product.sku;
  const href = `/products/${encodeURIComponent(product.slug ?? '')}`;

  return (
    <div className="card group relative flex flex-col p-2 transition-colors hover:border-brand-500">
      <div className="absolute end-2 top-2 z-10 flex flex-col gap-1">
        <FavButton productId={product.id} />
        <CompareButton productId={product.id} />
      </div>

      <Link href={href} className="block">
        <ProductImage src={product.image} alt={name} className="aspect-square w-full rounded" />
        <h3 className="mt-2 line-clamp-2 min-h-[2.6rem] text-[13px] font-medium leading-[1.3rem] text-slate-800 group-hover:text-brand-700">
          {name}
        </h3>
      </Link>

      <div className="mt-auto space-y-2 pt-2">
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
