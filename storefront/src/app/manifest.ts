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
    background_color: '#f8fafc',
    theme_color: '#0f766e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
