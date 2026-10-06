export type ProductListItem = {
  id: number;
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  name: string | null;
  slug: string | null;
  image: string | null;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type CategoryItem = {
  id: number;
  parentId: number | null;
  name: string | null;
  slug: string | null;
  productCount: number;
  imageUrl?: string | null;
};

export type ProductDetail = {
  id: number;
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  category: { id: number; name: string | null; slug: string | null } | null;
  images: string[];
  alternates: Record<string, string>;
};

export type OrderDetail = {
  id: number;
  number: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  fullName: string;
  phone: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  note: string | null;
  paymentRef: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { productId: number | null; name: string; sku: string; unitPrice: number; quantity: number }[];
};

// ---------- content (pages, blocks) ----------
export type SlideDto = {
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
  subtitle: string | null;
  buttonText: string | null;
};

export type BlockDto =
  | { id: number; type: 'slider'; data: { slides: SlideDto[] } }
  | { id: number; type: 'banner'; data: { imageUrl: string; linkUrl: string | null; title: string | null } }
  | { id: number; type: 'text'; data: { text: string | null } }
  | { id: number; type: 'products'; data: { title: string | null; categorySlug: string | null; items: ProductListItem[] } }
  | { id: number; type: 'categories'; data: { title: string | null; items: CategoryItem[] } };

export type PublicPage = {
  id: number;
  title: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  alternates: Record<string, string>;
  blocks: BlockDto[];
};

// ---------- catalog extras ----------
export type ProductsResult = Paged<ProductListItem> & { fuzzy: boolean };

export type ProductCompareItem = ProductListItem & { categoryName: string | null; shortDescription: string | null };

export type FacetCategory = { id: number; parentId: number | null; name: string | null; slug: string | null; count: number };
export type Facets = {
  categories: FacetCategory[];
  minPrice: number;
  maxPrice: number;
  inStockCount: number;
  onSaleCount: number;
  total: number;
};

export type SuggestResult = {
  products: ProductListItem[];
  categories: { id: number; name: string | null; slug: string | null }[];
};

// ---------- account ----------
export type Profile = { fullName: string; phone: string | null; email: string | null; createdAt: string };
export type Address = {
  id: number;
  title: string;
  fullName: string;
  phone: string;
  province: string;
  city: string;
  line: string;
  postalCode: string;
  isDefault: boolean;
  lat?: number | null;
  lng?: number | null;
};
export type Payment = { orderNumber: string; amount: number; reference: string | null; paidAt: string; status: string };
export type OrderListItem = {
  id: number;
  number: string;
  status: string;
  total: number;
  fullName: string;
  phone: string;
  createdAt: string;
  paidAt: string | null;
};

// ---------- stories, recommendations, assistant ----------
export type StoryItemDto = { imageUrl: string; caption: string | null; linkUrl: string | null; durationSec: number };
export type StoryGroup = { id: number; title: string | null; coverUrl: string; items: StoryItemDto[] };

export type RecommendationSection = { key: 'buyAgain' | 'forYou' | 'popular'; items: ProductListItem[] };

export type AssistantReply = {
  reply: string;
  products: ProductListItem[];
  links: { label: string; url: string }[];
};
