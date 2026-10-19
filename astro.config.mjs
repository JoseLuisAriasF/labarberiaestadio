import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwind from '@tailwindcss/vite';

// Estático + Pages Functions (functions/): el adaptador de Cloudflare para
// Astro 7 ya no publica en Pages, y aquí el servidor solo hace 2 cosas.
export default defineConfig({
  site: process.env.SITE_URL || 'https://labarberiaestadio.pages.dev',
  output: 'static',
  integrations: [
    react(),
    sitemap({ filter: (p) => !/\/(admin|barber|perfil|login|registro)/.test(p) }),
  ],
  build: { inlineStylesheets: 'never' },
  security: {
    // Hashes de cada <script> en un <meta> CSP: ningún script inyectado corre.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://server.arcgisonline.com https://lh3.googleusercontent.com",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://routing.openstreetmap.de https://nominatim.openstreetmap.org https://cloudflareinsights.com",
        "font-src 'self' data:",
        "worker-src 'self' blob:",
        "frame-src https://challenges.cloudflare.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      scriptDirective: { resources: ["'self'", 'https://challenges.cloudflare.com', 'https://static.cloudflareinsights.com'] },
    },
  },
  vite: { plugins: [tailwind()] },
});
