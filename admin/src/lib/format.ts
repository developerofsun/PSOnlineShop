import type { OrderStatus } from './types';

export const formatNumber = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
export const formatToman = (n: number) => `${formatNumber(n)} تومان`;

/** Jalali (Shamsi) date/time in Tehran time. Values come from the API in UTC. */
export function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Asia/Tehran',
  }).format(new Date(iso));
}

export const formatBytes = (b: number) =>
  b < 1024 ? `${formatNumber(b)} B` : b < 1024 * 1024 ? `${formatNumber(Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;

export const STATUS: Record<OrderStatus, { label: string; color: string }> = {
  Pending: { label: 'در انتظار پرداخت', color: 'default' },
  Paid: { label: 'پرداخت‌شده', color: 'blue' },
  Processing: { label: 'در حال پردازش', color: 'gold' },
  Shipped: { label: 'ارسال شد', color: 'cyan' },
  Delivered: { label: 'تحویل داده شد', color: 'green' },
  Cancelled: { label: 'لغو شده', color: 'red' },
  Refunded: { label: 'مسترد شده', color: 'purple' },
};

/** Persian/Arabic digits -> ASCII, so admins can type numbers in either form. */
export const toAscii = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
