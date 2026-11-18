import type { Locale } from '@/i18n';
import { localMedia } from '@/lib/media';
import { tiersFromBase } from '@/lib/pricing';
import { ApiError } from '../errors';
import type {
  Category,
  CategoryRef,
  Faq,
  Page,
  Post,
  PostSummary,
  PostTone,
  Product,
  ProductBadge,
  ProductQuery,
  ProductSummary,
  StoreSettings,
  Variant,
} from '../types';
import categoryRows from './fixtures/categories.json';
import faqRows from './fixtures/faqs.json';
import postRows from './fixtures/posts.json';
import productRows from './fixtures/products.json';
import storeRow from './fixtures/store.json';

/**
 * The mock catalog: fixture rows in, domain objects out, in one locale.
 * Fixture text is stored as `{ en, es }`; the real API localizes on its side
 * from `Accept-Language`, so nothing above this file knows text has two forms.
 */
type Localized = { en: string; es: string };
type ProductRow = (typeof productRows)[number];
type CategoryRow = (typeof categoryRows)[number];

export const CURRENCY = storeRow.currency;
export const store = storeRow;

const money = (amount: number) => ({ amount, currency: CURRENCY });

export function createCatalog(locale: Locale) {
  const tr = (text: Localized): string => text[locale] ?? text.en;

  const categoryByKey = new Map<string, CategoryRow>(categoryRows.map((row) => [row.key, row]));
  const productByKey = new Map<string, ProductRow>(productRows.map((row) => [row.key, row]));
  const productByHandle = new Map<string, ProductRow>(productRows.map((row) => [row.handle, row]));

  const categoryRef = (key: string): CategoryRef => {
    const row = categoryByKey.get(key);
    if (!row) throw new Error(`Fixture product points at unknown category "${key}".`);
    return { id: row.id, handle: row.handle, name: tr(row.name) };
  };

  const toCategory = (row: CategoryRow): Category => ({
    id: row.id,
    handle: row.handle,
    name: tr(row.name),
    description: tr(row.description),
    image: localMedia('products', row.image, tr(row.name)),
    productCount: productRows.filter((product) => product.categoryKey === row.key).length,
  });

  const toVariant = (row: ProductRow['variants'][number]): Variant => ({
    id: row.id,
    sku: row.sku,
    title: row.title ? tr(row.title) : null,
    price: money(row.price),
    priceTiers: tiersFromBase(row.price, CURRENCY),
    available: true,
  });

  const toSummary = (row: ProductRow): ProductSummary => {
    const first = row.variants[0];
    if (!first) throw new Error(`Fixture product "${row.key}" has no variants.`);
    const tiers = tiersFromBase(first.price, CURRENCY);
    return {
      id: row.id,
      handle: row.handle,
      title: tr(row.title),
      summary: tr(row.summary),
      sku: row.sku,
      unitLabel: tr(row.unit),
      category: categoryRef(row.categoryKey),
      image: localMedia('products', row.image, tr(row.title)),
      badge: row.badge as ProductBadge | null,
      rating: { average: row.rating, count: row.reviewCount },
      price: money(first.price),
      bulkPrice: tiers[tiers.length - 1]?.price ?? money(first.price),
      defaultVariantId: first.id,
    };
  };

  const summaryByKey = (key: string): ProductSummary => {
    const row = productByKey.get(key);
    if (!row) throw new Error(`Unknown fixture product "${key}".`);
    return toSummary(row);
  };

  const toProduct = (row: ProductRow): Product => ({
    ...toSummary(row),
    features: row.features.map(tr),
    specifications: row.specs.map((spec) => ({ label: tr(spec.label), value: tr(spec.value) })),
    optionName: row.optionName ? tr(row.optionName) : null,
    variants: row.variants.map(toVariant),
    frequentlyBoughtWith: row.boughtWith.map(summaryByKey),
    related: productRows.filter((other) => other.categoryKey === row.categoryKey && other.key !== row.key).slice(0, 4).map(toSummary),
  });

  /** Searches both languages, the way the real search index covers every locale of a product. */
  const haystack = (row: ProductRow): string => {
    const category = categoryByKey.get(row.categoryKey);
    return [row.title.en, row.title.es, row.summary.en, row.summary.es, category?.name.en, category?.name.es, row.sku].join(' ').toLowerCase();
  };

  const basePrice = (row: ProductRow): number => row.variants[0]?.price ?? 0;

  function listProducts(query: ProductQuery = {}): Page<ProductSummary> {
    let rows = [...productRows];
    if (query.category) {
      const category = categoryRows.find((row) => row.handle === query.category);
      rows = category ? rows.filter((row) => row.categoryKey === category.key) : [];
    }
    if (query.handles) {
      const wanted = query.handles;
      rows = wanted.map((handle) => productByHandle.get(handle)).filter((row): row is ProductRow => Boolean(row));
    }
    if (query.featured) {
      rows = rows.filter((row) => row.featuredRank !== null).sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0));
    }
    const q = query.q?.trim().toLowerCase();
    if (q) rows = rows.filter((row) => haystack(row).includes(q));
    if (query.priceMin !== undefined) rows = rows.filter((row) => basePrice(row) >= (query.priceMin ?? 0));
    if (query.priceMax !== undefined) rows = rows.filter((row) => basePrice(row) <= (query.priceMax ?? Infinity));
    if (query.sort === 'price_asc') rows.sort((a, b) => basePrice(a) - basePrice(b));
    if (query.sort === 'price_desc') rows.sort((a, b) => basePrice(b) - basePrice(a));
    if (query.sort === 'top_rated') rows.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);

    const totalCount = rows.length;
    const start = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const limit = query.limit ?? 50;
    const page = rows.slice(start, start + limit);
    const end = start + page.length;
    return { items: page.map(toSummary), hasMore: end < totalCount, nextCursor: end < totalCount ? String(end) : null, totalCount };
  }

  const toPostSummary = (row: (typeof postRows)[number]): PostSummary => ({
    id: row.id,
    slug: row.slug,
    tag: tr(row.tag),
    tone: row.tone as PostTone,
    image: localMedia('products', row.image, ''),
    readMinutes: row.readMinutes,
    title: tr(row.title),
    excerpt: tr(row.excerpt),
    publishedAt: row.publishedAt,
  });

  return {
    settings: (): StoreSettings => ({
      name: storeRow.name,
      legalName: storeRow.legalName,
      currency: CURRENCY,
      serviceArea: tr(storeRow.serviceArea),
      freeDeliveryThreshold: money(storeRow.freeDeliveryThreshold),
      recurring: storeRow.recurring,
      contact: storeRow.contact as StoreSettings['contact'],
      social: storeRow.social,
    }),

    categories: (): Category[] => [...categoryRows].sort((a, b) => a.position - b.position).map(toCategory),

    category(handle: string): Category {
      const row = categoryRows.find((candidate) => candidate.handle === handle);
      if (!row) throw ApiError.notFound(`Category "${handle}"`);
      return toCategory(row);
    },

    listProducts,

    product(handle: string): Product {
      const row = productByHandle.get(handle);
      if (!row) throw ApiError.notFound(`Product "${handle}"`);
      return toProduct(row);
    },

    summaryByKey,

    /** The variant and its product, for pricing a cart or order line. */
    findVariant(variantId: string) {
      for (const row of productRows) {
        const variant = row.variants.find((candidate) => candidate.id === variantId);
        if (variant) return { row, variant: toVariant(variant), summary: toSummary(row) };
      }
      return null;
    },

    variantIdOf(productKey: string): string {
      const id = productByKey.get(productKey)?.variants[0]?.id;
      if (!id) throw new Error(`Unknown fixture product "${productKey}".`);
      return id;
    },

    posts: (): PostSummary[] => postRows.map(toPostSummary),

    post(slug: string): Post {
      const row = postRows.find((candidate) => candidate.slug === slug);
      if (!row) throw ApiError.notFound(`Post "${slug}"`);
      return { ...toPostSummary(row), body: row.body.map(tr) };
    },

    faqs: (): Faq[] => faqRows.map((row) => ({ id: row.id, question: tr(row.question), answer: tr(row.answer) })),
  };
}

export type Catalog = ReturnType<typeof createCatalog>;
