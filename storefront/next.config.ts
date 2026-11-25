import type { NextConfig } from 'next';

// Server-side URL of the .NET API. The browser never talks to it directly:
// it uses same-origin /backend/* and /uploads/* which Next proxies below.
const API_URL = process.env.API_URL ?? 'http://localhost:5080';

// Map tiles: the ONLY remote origin the storefront may load images from. It defaults to the public
// OpenStreetMap tile server. If you host your own tile server (fully local setup), set MAP_TILE_ORIGIN to its
// origin (e.g. http://tiles.internal:8080) and change "Map tile URL" in the admin settings. Set it to an empty
// string to allow no remote images at all (the map then shows no tiles).
const TILE_ORIGIN = process.env.MAP_TILE_ORIGIN ?? 'https://tile.openstreetmap.org';

// The e-namad trust seal is a remote <img> pasted into a footer HTML block. It only loads when the request
// comes from the domain registered in enamad, so the snippet's referrerpolicy="origin" is required, and the
// origin has to be allowed here or the CSP blocks the badge in production.
const ENAMAD_ORIGIN = 'https://trustseal.enamad.ir';

// Everything else must come from our own origin: no CDN, no remote fonts/scripts.
// (Next.js needs inline scripts/styles; in dev it also needs eval for hot reload.)
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Uploaded images are proxied through this origin (/uploads, /icon, /backend), so 'self' covers them.
  `img-src 'self' data: blob: ${TILE_ORIGIN} ${ENAMAD_ORIGIN}`.trim(),
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Development only: Next.js 16 blocks dev scripts (including the JavaScript that makes pages interactive) for any
// hostname other than localhost. Opening the dev site from a phone at http://<your-PC-ip>:3000 therefore shows the HTML but
// no button works. List the hostnames/IPs you use (no scheme, no port). "*" matches exactly one label, so
// "192.168.*.*" covers every address of a typical home/office network. Extra entries: DEV_ORIGINS="10.1.1.172,my-pc.local".
// This setting has no effect in production builds.
const devOrigins = [
  '192.168.*.*',
  '10.*.*.*',
  '172.*.*.*',
  ...(process.env.DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: devOrigins,

  // The Docker image copies .next/standalone, which contains only the server files it needs.
  output: 'standalone',

  // next-intl wiring WITHOUT the `next-intl/plugin` wrapper.
  // The plugin's only jobs are (1) aliasing 'next-intl/config' to the request config file and (2) exposing
  // trailing-slash/basePath to the runtime (we use neither). Importing the plugin loads @swc/core (needed only for
  // its optional message-extraction feature), and that native addon fails its permission check on some Windows
  // machines. Next.js 16 uses Turbopack, which needs a RELATIVE alias path. To go back to the plugin later:
  //   import createNextIntlPlugin from 'next-intl/plugin';
  //   export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
  turbopack: {
    resolveAlias: {
      'next-intl/config': './src/i18n/request.ts',
    },
  },

  async rewrites() {
    return [
      { source: '/backend/:path*', destination: `${API_URL}/:path*` },
      { source: '/uploads/:path*', destination: `${API_URL}/uploads/:path*` },
    ];
  },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
    ];
    if (process.env.NODE_ENV === 'production') {
      security.push({ key: 'Content-Security-Policy', value: csp });
    }
    return [
      { source: '/:path*', headers: security },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
