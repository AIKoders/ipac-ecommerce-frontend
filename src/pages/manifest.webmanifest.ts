import type { APIRoute } from 'astro';
import { site } from '@/config/site';
import { defaultLocale, translator } from '@/i18n';
import { seo } from '@/i18n/ns/seo';

export const prerender = true;

/** The web app manifest BaseLayout links to: how the store looks when it is installed or pinned to a home screen. */
export const GET: APIRoute = () => {
  const manifest = {
    name: site.name,
    short_name: site.name,
    description: translator(seo, defaultLocale)('siteTagline'),
    start_url: '/',
    display: 'standalone',
    background_color: site.themeColor,
    theme_color: site.themeColor,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/manifest+json' } });
};
