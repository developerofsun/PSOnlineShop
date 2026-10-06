export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export type UserInfo = {
  id: number;
  fullName: string;
  userName: string | null;
  phone: string | null;
  email: string | null;
  roles: string[];
  permissions: string[];
};
export type AuthResponse = { token: string; expires: string; user: UserInfo };

export type OrderStatus = 'Pending' | 'Paid' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled' | 'Refunded';

export type OrderListItem = {
  id: number;
  number: string;
  status: OrderStatus;
  total: number;
  fullName: string;
  phone: string;
  createdAt: string;
  paidAt: string | null;
};

export type OrderDetail = {
  id: number;
  number: string;
  status: OrderStatus;
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
  lat?: number | null;
  lng?: number | null;
  paymentRef: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { productId: number | null; name: string; sku: string; unitPrice: number; quantity: number }[];
};

export type Dashboard = {
  productsCount: number;
  ordersToday: number;
  pendingOrders: number;
  revenue30Days: number;
  customersCount: number;
  last14Days: { date: string; revenue: number; orders: number }[];
  lowStock: { id: number; sku: string; name: string | null; stock: number }[];
  recentOrders: OrderListItem[];
};

export type AdminProductListItem = {
  id: number;
  sku: string;
  name: string | null;
  price: number;
  salePrice: number | null;
  stock: number;
  isPublished: boolean;
  image: string | null;
  createdAt: string;
};

export type ProductTranslation = {
  lang: string;
  name: string;
  slug: string | null;
  shortDescription: string | null;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type ProductDetail = {
  id: number;
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  isPublished: boolean;
  categoryId: number | null;
  translations: ProductTranslation[];
  images: string[];
};

export type CategoryItem = {
  id: number;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  name: string | null;
  productCount: number;
};

export type CategoryTranslation = { lang: string; name: string; slug: string | null; description: string | null };
export type CategoryDetail = {
  imageUrl?: string | null;
  id: number;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  translations: CategoryTranslation[];
};

export type Media = { id: number; url: string; originalName: string; contentType: string; size: number; createdAt: string };

export const LANGS = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
] as const;

// ---------- roles, users ----------
export type PermissionDef = { key: string; group: string; label: string };
export type RoleRow = { id: number; name: string; isSystem: boolean; userCount: number; permissions: string[] };
export type RoleLookup = { id: number; name: string };
export type UserRow = {
  id: number;
  fullName: string;
  userName: string | null;
  email: string | null;
  phone: string | null;
  roles: string[];
  isDisabled: boolean;
  createdAt: string;
};

// ---------- content ----------
export type L10n = Record<string, string>;

export type SlideForm = {
  imageUrl: string;
  linkUrl: string | null;
  title: L10n;
  subtitle: L10n;
  buttonText: L10n;
};
export type SliderRow = { id: number; name: string; isActive: boolean; slideCount: number };
export type SliderDetail = { id: number; name: string; isActive: boolean; slides: SlideForm[] };

export type BannerRow = { id: number; name: string; imageUrl: string; linkUrl: string | null; title: L10n; isActive: boolean };
export type TextRow = { id: number; name: string; key: string; content: L10n; isActive: boolean };

export type PageRow = {
  id: number;
  title: string | null;
  slug: string | null;
  isPublished: boolean;
  isHome: boolean;
  blockCount: number;
  createdAt: string;
};
export type PageTranslationForm = { lang: string; title: string; slug: string | null; seoTitle: string | null; seoDescription: string | null };
export type BlockForm = { type: string; isActive: boolean; config: Record<string, unknown> };
export type PageDetail = { id: number; isPublished: boolean; isHome: boolean; translations: PageTranslationForm[]; blocks: BlockForm[] };

// ---------- stories ----------
export type StoryRow = { id: number; name: string; isActive: boolean; sortOrder: number; itemCount: number; expiresAt: string | null };
export type StoryItemForm = { imageUrl: string; linkUrl: string | null; caption: L10n; durationSec: number };
export type StoryDetail = {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
  coverUrl: string;
  title: L10n;
  expiresAt: string | null;
  items: StoryItemForm[];
};
