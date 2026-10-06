'use client';

import dynamic from 'next/dynamic';

/** Client-only wrapper: Leaflet touches `window`, so it can never be rendered on the server. */
const MapPickerLoader = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-md bg-slate-100" aria-hidden />,
});

export default MapPickerLoader;
