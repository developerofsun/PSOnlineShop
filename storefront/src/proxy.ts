import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip API proxies, Next internals and any file with an extension (sw.js, icons, manifest...).
  // favicon.ico is named explicitly because its route handler has no extension: the locale middleware
  // would otherwise redirect it to /fa/favicon.ico.
  matcher: ['/((?!backend|uploads|_next|_vercel|favicon\\.ico|.*\\..*).*)'],
};
