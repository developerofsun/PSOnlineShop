import type { CSSProperties } from 'react';

/**
 * Header sizes and colours from the admin (Settings → Header). Stored as site.header_* settings and applied with
 * CSS variables on the header wrapper, so the existing layout and the interactive widgets stay untouched.
 */

export type HeaderStyle = {
  barHeight: number; // px, main bar (logo, search, account, cart)
  logoHeight: number; // px
  searchWidth: number; // px, the desktop search box
  iconSize: number; // px, account / favorites / compare icons
  cartHeight: number; // px, the green cart button
  backgroundColor: string; // header bars
  textColor: string; // icons, category bar, main bar text
  accentColor: string; // cart button and other filled accents
};

const preset = (bg: string, text: string, accent: string) => ({ backgroundColor: bg, textColor: text, accentColor: accent });

export const HEADER_PRESETS: Record<string, Partial<HeaderStyle>> = {
  brand: preset('#ffffff', '#5c584f', '#28a745'),
  dark: preset('#1f1e1a', '#f1efea', '#28a745'),
  light: preset('#ffffff', '#1f1e1a', '#1d4ed8'),
  warm: preset('#f8f7f4', '#46433b', '#d99a0b'),
};

const DEFAULT_HEADER: HeaderStyle = {
  barHeight: 60,
  logoHeight: 40,
  searchWidth: 0, // 0 = flexible (fills the space between logo and actions)
  iconSize: 20,
  cartHeight: 40,
  ...preset('#ffffff', '#5c584f', '#28a745'),
};

const hex = (v: string | null | undefined, fallback: string) =>
  v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;

const num = (v: string | null | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function parseHeaderStyle(settings: Record<string, string | null> | null | undefined): HeaderStyle {
  const s = settings ?? {};
  const p = HEADER_PRESETS[s['site.header_preset'] ?? ''] ?? {};
  return {
    barHeight: num(s['site.header_height'], DEFAULT_HEADER.barHeight, 48, 120),
    logoHeight: num(s['site.header_logo_height'], DEFAULT_HEADER.logoHeight, 24, 96),
    searchWidth: num(s['site.header_search_width'], DEFAULT_HEADER.searchWidth, 0, 900),
    iconSize: num(s['site.header_icon_size'], DEFAULT_HEADER.iconSize, 16, 36),
    cartHeight: num(s['site.header_cart_height'], DEFAULT_HEADER.cartHeight, 32, 64),
    backgroundColor: hex(s['site.header_bg_color'], p.backgroundColor ?? DEFAULT_HEADER.backgroundColor),
    textColor: hex(s['site.header_text_color'], p.textColor ?? DEFAULT_HEADER.textColor),
    accentColor: hex(s['site.header_accent_color'], p.accentColor ?? DEFAULT_HEADER.accentColor),
  };
}

/** CSS variables read by the header components (see the .site-header rules in globals.css). */
export function headerVars(h: HeaderStyle): CSSProperties {
  return {
    ['--hdr-h' as string]: `${h.barHeight}px`,
    ['--hdr-logo' as string]: `${h.logoHeight}px`,
    // 'flex' keeps the original behaviour: the box fills the space between the logo and the actions.
    ['--hdr-search' as string]: h.searchWidth > 0 ? `${h.searchWidth}px` : 'flex',
    ['--hdr-icon' as string]: `${h.iconSize}px`,
    ['--hdr-cart' as string]: `${h.cartHeight}px`,
    ['--hdr-bg' as string]: h.backgroundColor,
    ['--hdr-text' as string]: h.textColor,
    ['--hdr-accent' as string]: h.accentColor,
  };
}
