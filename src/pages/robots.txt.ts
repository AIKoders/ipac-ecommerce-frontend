import type { APIRoute } from 'astro';
import { env } from '@/config/env';
import { locales, localizePath } from '@/i18n';

export const prerender = true;

/** Belong to one shopper: nothing in them is worth a crawl, in any locale. */
const PRIVATE_PATHS = ['/cart', '/checkout', '/account'];

/** Only production is crawlable; staging, previews and local builds turn every crawler away. */
export const GET: APIRoute = () => {
  const lines = env.indexable
    ? ['User-agent: *', 'Allow: /', ...locales.flatMap((locale) => PRIVATE_PATHS.map((path) => `Disallow: ${localizePath(locale, path)}`)), '', `Sitemap: ${env.siteUrl}/sitemap.xml`]
    : ['User-agent: *', 'Disallow: /'];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
