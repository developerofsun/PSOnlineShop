import { apiGet } from '@/lib/api';

// The browser tab icon (and the web-app icon, see manifest.ts). No static favicon.ico ships with the app, so this
// route always answers, and /favicon.ico is excluded from the locale middleware (see proxy.ts).
// The image is the one uploaded in admin → Settings → Site information (site.favicon_url); the bundled icon
// /icons/icon-192.png is used when that setting is empty.


export async function GET(request: Request) {
  const settings = await apiGet<Record<string, string | null>>('/api/settings/public', 30);
  const url = settings?.['site.favicon_url'];

  if (url && url.startsWith('/uploads/') && !url.includes('..')) {
    // next.config.ts proxies /uploads/* to the API, so the browser fetches it from this same origin.
    return new Response(null, { status: 307, headers: { Location: new URL(url, request.url).toString() } });
  }

  return new Response(null, { status: 307, headers: { Location: new URL('/icons/icon-192.png', request.url).toString() } });
}
