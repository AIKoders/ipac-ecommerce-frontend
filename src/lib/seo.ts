import { env } from '@/config/env';
import { site } from '@/config/site';
import { defaultLocale, localizePath, locales, type Locale } from '@/i18n';
import type { PostSummary, Product, StoreSettings } from '@/lib/api/types';

/** Absolute URL of a locale-free path in one locale. */
export const absoluteUrl = (locale: Locale, path: string): string => `${env.siteUrl}${localizePath(locale, path)}`.replace(/\/$/, '') || env.siteUrl;

/** Absolute URL of a file that is not localized (images, feeds). */
export const assetUrl = (path: string): string => `${env.siteUrl}${path}`;

/** hreflang alternates of a page that exists in every locale, plus x-default. */
export const alternates = (path: string) => [
  ...locales.map((locale) => ({ hreflang: locale, href: absoluteUrl(locale, path) })),
  { hreflang: 'x-default', href: absoluteUrl(defaultLocale, path) },
];

export const ogImageUrl = (locale: Locale, key: string): string => assetUrl(`/og/${locale}/${key}.jpg`);

/** `@id` of the site-wide nodes, for page-level nodes that reference them. */
export const ORGANIZATION_ID = `${env.siteUrl}/#organization`;
export const WEBSITE_ID = `${env.siteUrl}/#website`;

type JsonLd = Record<string, unknown>;

/** Organization and WebSite, present on every page and referenced by the page-level nodes. */
export function siteGraph(locale: Locale, settings: StoreSettings, description: string): JsonLd[] {
  const sameAs = [settings.social.facebook, settings.social.instagram].filter((url): url is string => Boolean(url) && !/^https:\/\/www\.(facebook|instagram)\.com\/?$/.test(url ?? ''));
  const organization: JsonLd = {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: site.name,
    legalName: settings.legalName,
    url: env.siteUrl,
    logo: assetUrl('/icon-512.png'),
    description,
    areaServed: settings.serviceArea,
    ...(sameAs.length ? { sameAs } : {}),
    ...(settings.contact.phone ? { telephone: settings.contact.phone } : {}),
    ...(settings.contact.email ? { email: settings.contact.email } : {}),
    ...(settings.contact.address
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: settings.contact.address.line1,
            addressLocality: settings.contact.address.city,
            addressRegion: settings.contact.address.region,
            postalCode: settings.contact.address.postalCode,
            addressCountry: settings.contact.address.country,
          },
        }
      : {}),
  };
  const website: JsonLd = {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: env.siteUrl,
    name: site.name,
    inLanguage: locale,
    publisher: { '@id': ORGANIZATION_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl(locale, '/shop')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
  return [organization, website];
}

export const breadcrumbList = (items: { name: string; url: string }[]): JsonLd => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
});

/**
 * Product with its offers. Ratings are left out on purpose: the catalog's
 * ratings are sample data, and review markup must reflect real reviews.
 */
export function productNode(locale: Locale, product: Product): JsonLd {
  const url = absoluteUrl(locale, `/products/${product.handle}`);
  const prices = product.variants.flatMap((variant) => variant.priceTiers.map((tier) => tier.price.amount));
  const currency = product.price.currency;
  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: product.summary,
    sku: product.sku,
    category: product.category.name,
    image: [assetUrl(product.image.url)],
    brand: { '@type': 'Brand', name: site.name },
    url,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: currency,
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: product.variants.some((variant) => variant.available) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@id': ORGANIZATION_ID },
      url,
    },
  };
}

export function itemList(locale: Locale, products: { handle: string; title: string }[]): JsonLd {
  return {
    '@type': 'ItemList',
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, name: product.title, url: absoluteUrl(locale, `/products/${product.handle}`) })),
  };
}

export function blogPosting(locale: Locale, post: PostSummary, body: string[]): JsonLd {
  const url = absoluteUrl(locale, `/blog/${post.slug}`);
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: post.title,
    description: post.excerpt,
    articleSection: post.tag,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    inLanguage: locale,
    image: [ogImageUrl(locale, `blog/${post.slug}`)],
    wordCount: body.join(' ').split(/\s+/).length,
    mainEntityOfPage: url,
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export const faqPage = (faqs: { question: string; answer: string }[]): JsonLd => ({
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
});

export type { JsonLd };
