// Plain module (no 'use client'): usable from both server and client components.

export type MapSettings = {
  /** Admin switch: ask customers for their delivery point on a map. */
  enabled: boolean;
  tileUrl: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
};

export const DEFAULT_MAP: MapSettings = {
  enabled: false,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  centerLat: 35.6892,
  centerLng: 51.389,
  zoom: 12,
};

/** Turns the public settings dictionary from the API into typed map settings. */
export function parseMapSettings(s: Record<string, string | null> | null): MapSettings {
  if (!s) return DEFAULT_MAP;
  const num = (v: string | null | undefined, d: number) => {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) ? n : d;
  };
  return {
    enabled: s['site.map_enabled'] === 'true',
    tileUrl: s['site.map_tile_url'] || DEFAULT_MAP.tileUrl,
    centerLat: num(s['site.map_center_lat'], DEFAULT_MAP.centerLat),
    centerLng: num(s['site.map_center_lng'], DEFAULT_MAP.centerLng),
    zoom: Math.min(18, Math.max(3, Math.round(num(s['site.map_zoom'], DEFAULT_MAP.zoom)))),
  };
}
