'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_MAP, type MapSettings } from '@/lib/mapSettings';

const Ctx = createContext<MapSettings>(DEFAULT_MAP);
export const useMapSettings = () => useContext(Ctx);

export function MapSettingsProvider({ value, children }: { value: MapSettings; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
