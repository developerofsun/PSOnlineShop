'use client';

import dynamic from 'next/dynamic';

/** Client-only wrapper: three.js needs WebGL and `window`, so it is never rendered on the server. */
const Shop3DLoader = dynamic(() => import('./Shop3D'), {
  ssr: false,
  loading: () => <div className="h-[68vh] min-h-[420px] animate-pulse rounded-md bg-slate-100" aria-hidden />,
});

export default Shop3DLoader;
