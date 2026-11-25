import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BrandIcon } from './FooterSocialIcons';
import FooterGrid from './FooterGrid';

// The shape returned by GET /api/content/footer (resolved for one language by the API).
type Item = { text?: string | null; href?: string | null; icon?: string };
type Size = 'sm' | 'md' | 'lg' | 'xl';
type Align = 'start' | 'center' | 'end' | null;
type Element =
  | { type: 'heading'; text?: string | null; size?: Size }
  | { type: 'text'; text?: string | null; size?: Size }
  | { type: 'links'; items: Item[]; size?: Size }
  | { type: 'contact'; items: Item[]; size?: Size }
  | { type: 'logo'; logo: boolean; text: boolean; size?: Size; align?: Align }
  | { type: 'image'; imageUrl?: string | null; size?: Size; align?: Align }
  | { type: 'html'; html?: string | null; size?: Size; align?: Align }
  | { type: 'newsletter'; size?: Size }
  | { type: 'socials'; size?: Size };

/** Size presets chosen per element in the designer; md is the original look. Mirrored by the admin preview. */
const SCALE: Record<Size, number> = { sm: 0.85, md: 1, lg: 1.25, xl: 1.5 };
const BASE = { heading: 16, text: 14, link: 14, contactIcon: 16, logoH: 48, logoW: 180, logoText: 24, social: 36, socialIcon: 16, imageH: 64 };
const px = (base: number, size?: Size) => `${Math.round(base * SCALE[size ?? 'md'])}px`;
const alignItems = (align?: Align) => (align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start');

export type PublicFooter = {
  theme: string;
  headingColor: string | null;
  linkColor: string | null;
  background: string | null;
  textColor: string | null;
  mutedColor: string | null;
  copyright: string | null;
  pageSlug: string | null;
  columns: { width: number; elements: Element[] }[];
  socials: { network: string; url: string }[];
};

/** A faint lighter line over any footer colour, for the copyright divider. */
const lightDivider = 'rgba(255,255,255,.14)';

function Href({ href, className, style, children }: { href?: string | null; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  if (!href) return <span className={className} style={style}>{children}</span>;
  // Site-relative links go through next-intl's Link (it prefixes / keeps the active locale).
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  // tel:/mailto: belong in the same tab; web addresses open beside the shop.
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      className={className}
      style={style}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

/** The store footer built in the admin's footer designer (Content → Footer designer). */
export default async function DesignedFooter({
  footer,
  siteName,
  logoUrl,
}: {
  footer: PublicFooter;
  siteName: string;
  logoUrl?: string | null;
}) {
  const t = await getTranslations('footer');
  const tn = await getTranslations('newsletter');
  const year = new Date().getFullYear();

  const bg = footer.background ?? '#1f1e1a';
  const fg = footer.textColor ?? '#f1efea';
  const muted = footer.mutedColor ?? '#a29d92';
  const custom = footer.theme === 'custom';
  const heading = custom ? (footer.headingColor ?? fg) : '#ffffff';
  const link = custom ? (footer.linkColor ?? fg) : fg;
  const hasSocials = footer.socials.length > 0;
  // Equal fractions of the row: the admin sends normalized widths, this keeps the grid valid regardless.
  const gridTemplate = footer.columns.map((c) => `minmax(0, ${Math.max(0.1, c.width).toFixed(3)}fr)`).join(' ');

  const render = (el: Element, key: number) => {
    switch (el.type) {
      case 'heading':
        return (
          <h3 key={key} className="font-semibold" style={{ color: heading, fontSize: px(BASE.heading, el.size) }}>
            {el.text}
          </h3>
        );
      case 'text':
        return (
          <p key={key} className="whitespace-pre-line leading-7" style={{ color: muted, fontSize: px(BASE.text, el.size) }}>
            {el.text}
          </p>
        );
      case 'links':
        return (
          <ul key={key} className="space-y-2" style={{ fontSize: px(BASE.link, el.size) }}>
            {el.items.map((it, i) => (
              <li key={i}>
                <Href href={it.href} className="transition-opacity hover:opacity-75 hover:underline" style={{ color: link }}>
                  {it.text}
                </Href>
              </li>
            ))}
          </ul>
        );
      case 'contact':
        return (
          <ul key={key} className="space-y-2" style={{ fontSize: px(BASE.link, el.size) }}>
            {el.items.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <BrandIcon
                  name={it.icon ?? 'phone'}
                  className="shrink-0"
                  style={{ color: muted, width: px(BASE.contactIcon, el.size), height: px(BASE.contactIcon, el.size), marginTop: 2 }}
                />
                <Href href={it.href} className="transition-opacity hover:opacity-75 hover:underline" style={{ color: fg }}>
                  {it.text}
                </Href>
              </li>
            ))}
          </ul>
        );
      case 'logo':
        return (
          <div key={key} className="flex flex-col gap-2" style={{ alignItems: alignItems(el.align) }}>
            {el.logo &&
              (logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={siteName} className="w-auto object-contain" style={{ height: px(BASE.logoH, el.size), maxWidth: px(BASE.logoW, el.size) }} />
              ) : null)}
            {el.text && <p className="font-display" style={{ color: muted, fontSize: px(BASE.logoText, el.size) }}>{siteName}</p>}
          </div>
        );
      case 'image':
        return el.imageUrl ? (
          <div key={key} className="flex" style={{ justifyContent: alignItems(el.align) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={el.imageUrl} alt="" className="w-auto max-w-full object-contain" style={{ height: px(BASE.imageH, el.size) }} />
          </div>
        ) : null;
      case 'html':
        // Sanitized by the API (allowlist of tags/attributes) before it was stored.
        return el.html ? (
          <div
            key={key}
            className="footer-html"
            style={{ display: 'flex', width: '100%', justifyContent: alignItems(el.align) }}
            dangerouslySetInnerHTML={{ __html: el.html }}
          />
        ) : null;
      case 'newsletter':
        // No newsletter backend exists yet, so this is a mailto sign-up: it works without new infrastructure.
        return (
          <form key={key} className="flex gap-2" action="mailto:" method="get" style={{ fontSize: px(BASE.link, el.size) }}>
            <input
              type="email"
              name="subject"
              required
              placeholder={tn('placeholder')}
              aria-label={tn('placeholder')}
              dir="ltr"
              className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 outline-none placeholder:opacity-60 focus:bg-white/15"
              style={{ color: fg, border: `1px solid ${lightDivider}`, fontSize: px(BASE.link, el.size) }}
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700"
              style={{ fontSize: px(BASE.link, el.size) }}
            >
              {tn('subscribe')}
            </button>
          </form>
        );
      case 'socials':
        return hasSocials ? (
          <ul key={key} className="flex flex-wrap gap-2">
            {footer.socials.map((s) => (
              <li key={s.network}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.network}
                  title={s.network}
                  className="grid place-items-center rounded-full transition-opacity hover:opacity-75"
                  style={{ background: 'rgba(255,255,255,.1)', color: fg, width: px(BASE.social, el.size), height: px(BASE.social, el.size) }}
                >
                  <BrandIcon name={s.network} style={{ width: px(BASE.socialIcon, el.size), height: px(BASE.socialIcon, el.size) }} />
                </a>
              </li>
            ))}
          </ul>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <footer className="mt-12" style={{ background: bg, color: fg }}>
      <FooterGrid columns={gridTemplate}>
        {footer.columns.map((col, ci) => (
          <div key={ci} className="space-y-2">
            {col.elements.map(render)}
          </div>
        ))}
      </FooterGrid>
      <div className="px-4 py-4 text-center text-xs" style={{ borderTop: `1px solid ${lightDivider}`, color: muted }}>
        © {year} {siteName}
        {footer.copyright || footer.pageSlug ? (
          <>
            {' — '}
            <Href href={footer.pageSlug} className="hover:underline" style={{ color: 'inherit' }}>
              {footer.copyright ?? t('allRights')}
            </Href>
          </>
        ) : null}
      </div>
    </footer>
  );
}
