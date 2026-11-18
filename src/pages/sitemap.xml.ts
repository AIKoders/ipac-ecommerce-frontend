import type { APIRoute } from 'astro';
import { locales } from '@/i18n';
import { getApi, type ProductSummary, type StorefrontApi } from '@/lib/api';
import { absoluteUrl, alternates } from '@/lib/seo';

export const prerender = true;

/**
 * Every indexable page, once per locale, each entry carrying the hreflang
 * alternates of its translations. Cart, checkout and account are left out:
 * they are `noindex` and disallowed in robots.txt.
 */

const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char);

async function listAllProducts(api: StorefrontApi): Promise<ProductSummary[]> {
  const products: ProductSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.catalog.listProducts({ limit: 100, cursor });
    products.push(...page.items);
    cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
  } while (cursor);
  return products;
}

export const GET: APIRoute = async () => {
  // Handles and slugs are the same in every locale, so one locale's catalog lists them all.
  const api = getApi('en');
  const [categories, products, posts] = await Promise.all([api.catalog.listCategories(), listAllProducts(api), api.content.listPosts()]);

  const pages: { path: string; lastmod?: string }[] = [
    { path: '/' },
    { path: '/shop' },
    ...categories.map((category) => ({ path: `/shop/${category.handle}` })),
    ...products.map((product) => ({ path: `/products/${product.handle}` })),
    { path: '/about' },
    { path: '/contact' },
    { path: '/blog' },
    ...posts.map((post) => ({ path: `/blog/${post.slug}`, lastmod: post.publishedAt })),
  ];

  const urls = pages.flatMap(({ path, lastmod }) => {
    const links = alternates(path).map((alternate) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`);
    // The sitemap schema wants <lastmod> before elements of other namespaces.
    return locales.map((locale) =>
      ['  <url>', `    <loc>${escapeXml(absoluteUrl(locale, path))}</loc>`, ...(lastmod ? [`    <lastmod>${escapeXml(lastmod)}</lastmod>`] : []), ...links, '  </url>'].join('\n'),
    );
  });

  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', ...urls, '</urlset>', ''].join('\n');
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
