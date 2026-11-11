import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'فروشگاه من',
    short_name: 'فروشگاه',
    description: 'فروشگاه آنلاین',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/fa',
    scope: '/',
    display: 'standalone',
    background_color: '#fefdfb',
    theme_color: '#28a745',
    icons: [
      // Uploaded in the admin (site.favicon_url) or the bundled icon; see app/favicon.ico/route.ts.
      { src: '/favicon.ico', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
