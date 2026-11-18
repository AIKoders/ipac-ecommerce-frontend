import type { APIRoute } from 'astro';
import { site } from '@/config/site';
import { translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import { seo } from '@/i18n/ns/seo';
import { getApi, type ProductSummary, type StorefrontApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { absoluteUrl } from '@/lib/seo';

export const prerender = true;

/**
 * A Markdown map of the store for AI crawlers and assistants (llmstxt.org):
 * what ipac is, the facts an answer needs, and where the main pages,
 * categories, products and articles live. The file is written in English, the
 * default locale: its few structural labels are part of the format, and every
 * name, description and price comes from the API or the dictionaries.
 */

const oneLine = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** `- [label](url): note`, the link-list item the format expects. */
const item = (label: string, url: string, note?: string): string => `- [${oneLine(label).replace(/[[\]]/g, '\\$&')}](${url})${note ? `: ${oneLine(note)}` : ''}`;

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
  const locale: Locale = 'en';
  const api = getApi(locale);
  const [settings, categories, products, posts] = await Promise.all([api.store.getSettings(), api.catalog.listCategories(), listAllProducts(api), api.content.listPosts()]);
  const tc = translator(common, locale);
  const ts = translator(seo, locale);
  const url = (path: string) => absoluteUrl(locale, path);
  const money = (amount: ProductSummary['price']) => formatMoney(amount, locale);

  const { recurring, contact } = settings;
  const intervals = new Intl.ListFormat(locale, { type: 'disjunction' }).format(recurring.intervalWeeks.map(String));
  const facts = [
    `Legal name: ${settings.legalName}`,
    `Service area: ${settings.serviceArea}`,
    `${tc('freeLocalDelivery')} on orders over ${money(settings.freeDeliveryThreshold).replace(/\.00$/, '')}`,
    `${tc('recurringOrders')}: ${recurring.discountPercent}% off, delivered every ${intervals} weeks`,
    `Currency: ${settings.currency}`,
    ...(contact.phone ? [`Phone: ${contact.phone}`] : []),
    ...(contact.email ? [`Email: ${contact.email}`] : []),
    ...(contact.address ? [`Warehouse: ${contact.address.line1}, ${contact.address.city}, ${contact.address.region} ${contact.address.postalCode}`] : []),
  ];

  const lines = [
    `# ${site.name}`,
    '',
    `> ${oneLine(ts('homeDescription'))}`,
    '',
    ...facts.map((fact) => `- ${fact}`),
    '',
    '## Main pages',
    '',
    item(tc('home'), url('/'), ts('siteTagline')),
    item(tc('shop'), url('/shop'), ts('shopDescription')),
    item(tc('about'), url('/about'), ts('aboutDescription')),
    item(tc('blog'), url('/blog'), ts('blogDescription')),
    item(tc('contact'), url('/contact'), ts('contactDescription')),
    '',
    '## Categories',
    '',
    ...categories.map((category) => item(category.name, url(`/shop/${category.handle}`), category.description)),
    '',
    '## Products',
    '',
    ...products.map((product) => item(product.title, url(`/products/${product.handle}`), `${product.unitLabel}, ${money(product.price)}`)),
    '',
    '## Blog',
    '',
    ...posts.map((post) => item(post.title, url(`/blog/${post.slug}`), post.excerpt)),
    '',
    '## Other languages',
    '',
    item(tc('spanish'), absoluteUrl('es', '/'), translator(seo, 'es')('siteTagline')),
    '',
  ];

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
