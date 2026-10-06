import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const API_URL = process.env.API_URL ?? 'http://localhost:5080';

// Production build only: block every remote resource (no CDN, fonts, scripts, images).
// Ant Design injects <style> tags at runtime, hence 'unsafe-inline' for styles.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'onshop-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`),
});

export default defineConfig({
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
      '/uploads': { target: API_URL, changeOrigin: true },
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
