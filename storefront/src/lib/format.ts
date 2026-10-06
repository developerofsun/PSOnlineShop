const numberLocale = (locale: string) => (locale === 'fa' ? 'fa-IR' : 'en-US');

export function formatNumber(n: number, locale: string) {
  return new Intl.NumberFormat(numberLocale(locale)).format(n);
}

/** Dates are stored in UTC; Persian users see the Jalali calendar, others Gregorian. */
export function formatDate(iso: string, locale: string) {
  const tag = locale === 'fa' ? 'fa-IR-u-ca-persian' : 'en-US';
  return new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(
    new Date(iso),
  );
}

/** Lets a Persian user type Persian/Arabic digits anywhere; the API wants ASCII digits. */
export function toAsciiDigits(s: string) {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
