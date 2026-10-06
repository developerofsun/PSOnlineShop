import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Skip API proxies, Next internals and any file with an extension (sw.js, icons, manifest...).
  matcher: ['/((?!backend|uploads|_next|_vercel|.*\\..*).*)'],
};
