'use client';

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css'; // bundled from node_modules: no CDN

export type LatLng = { lat: number; lng: number };

type Props = {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  /** Tile URL template, e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png (configurable in the admin settings). */
  tileUrl: string;
  center: LatLng;
  zoom: number;
  height?: number;
};

/**
 * OpenStreetMap picker: click the map or drag the pin. Leaflet is bundled locally; only the tile images come from
 * the configured tile server. Loaded client-side only (Leaflet needs `window`), see MapPickerLoader.
 */
export default function MapPicker({ value, onChange, tileUrl, center, zoom, height = 320 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const placeRef = useRef<((p: LatLng) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef({ value, center, zoom });

  useEffect(() => {
    let disposed = false;

    (async () => {
      const L = await import('leaflet');
      if (disposed || !el.current || mapRef.current) return;

      const { value: v, center: c, zoom: z } = initial.current;
      const map = L.map(el.current, {
        center: v ? [v.lat, v.lng] : [c.lat, c.lng],
        zoom: v ? Math.max(z, 16) : z,
      });
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({ className: '', html: '<div class="map-pin"></div>', iconSize: [28, 34], iconAnchor: [14, 34] });

      const place = (p: LatLng) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([p.lat, p.lng]);
          return;
        }
        const m = L.marker([p.lat, p.lng], { icon, draggable: true }).addTo(map);
        m.on('dragend', () => {
          const ll = m.getLatLng();
          onChangeRef.current({ lat: ll.lat, lng: ll.lng });
        });
        markerRef.current = m;
      };
      placeRef.current = place;

      map.on('click', (e) => {
        const p = { lat: e.latlng.lat, lng: e.latlng.lng };
        place(p);
        onChangeRef.current(p);
      });

      mapRef.current = map;
      if (v) place(v);
      setTimeout(() => map.invalidateSize(), 250); // the map is usually opened inside a modal
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      placeRef.current = null;
    };
  }, [tileUrl]);

  // The value can change from outside (e.g. "use my location").
  useEffect(() => {
    const map = mapRef.current;
    if (!value || !map || !placeRef.current) return;
    const cur = markerRef.current?.getLatLng();
    if (!cur || cur.lat !== value.lat || cur.lng !== value.lng) {
      placeRef.current(value);
      map.setView([value.lat, value.lng], Math.max(map.getZoom(), 16));
    }
  }, [value]);

  // dir="ltr": Leaflet's panes and controls are laid out left-to-right even on RTL pages.
  return <div ref={el} dir="ltr" style={{ height }} className="z-0 w-full overflow-hidden rounded-md border border-slate-300" />;
}
