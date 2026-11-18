import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import { shop } from '@/i18n/ns/shop';
import { getApi } from '@/lib/api';
import type { Category, Page, ProductQuery, ProductSort, ProductSummary } from '@/lib/api/types';
import { boot } from '@/stores/boot';
import { ProductCard } from './ProductCard';

/**
 * The catalog listing: aisle and price filters, sort, search results. The
 * page is prerendered with the unfiltered list, so the products are in the
 * HTML; search terms, price band and sort live in the query string
 * (`?q=tape&price=under-40&sort=price_asc`) and are applied through the API
 * once the page is in the browser. Aisles are separate pages, so their filter
 * buttons are links.
 */
type Band = 'any' | 'under-40' | '40-60' | 'over-60';

const BANDS: Record<Band, Pick<ProductQuery, 'priceMin' | 'priceMax'>> = {
  any: {},
  'under-40': { priceMax: 3999 },
  '40-60': { priceMin: 4000, priceMax: 6000 },
  'over-60': { priceMin: 6001 },
};
const BAND_LABEL = { any: 'bandAny', 'under-40': 'bandUnder40', '40-60': 'band40to60', 'over-60': 'bandOver60' } as const;
const SORTS: { value: ProductSort; label: 'sortFeatured' | 'sortLow' | 'sortHigh' | 'sortTop' }[] = [
  { value: 'featured', label: 'sortFeatured' },
  { value: 'price_asc', label: 'sortLow' },
  { value: 'price_desc', label: 'sortHigh' },
  { value: 'top_rated', label: 'sortTop' },
];

interface Filters {
  q: string;
  band: Band;
  sort: ProductSort;
}

const DEFAULTS: Filters = { q: '', band: 'any', sort: 'featured' };

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const band = params.get('price') as Band | null;
  const sort = params.get('sort') as ProductSort | null;
  return {
    q: params.get('q')?.trim() ?? '',
    band: band && band in BANDS ? band : 'any',
    sort: sort && SORTS.some((option) => option.value === sort) ? sort : 'featured',
  };
}

function toQueryString(filters: Filters, withSearch = true): string {
  const params = new URLSearchParams();
  if (withSearch && filters.q) params.set('q', filters.q);
  if (filters.band !== 'any') params.set('price', filters.band);
  if (filters.sort !== 'featured') params.set('sort', filters.sort);
  const text = params.toString();
  return text ? `?${text}` : '';
}

interface Props {
  locale: Locale;
  categories: Category[];
  /** The aisle this page is for; null on "all supplies". */
  category: Category | null;
  initial: Page<ProductSummary>;
}

export function ShopBrowser({ locale, categories, category, initial }: Props) {
  const t = translator(shop, locale);
  const tc = translator(common, locale);
  const to = (path: string) => localizePath(locale, path);

  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [page, setPage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  useEffect(() => boot(locale), [locale]);

  async function load(next: Filters): Promise<void> {
    const id = ++request.current;
    setBusy(true);
    try {
      const result = await getApi(locale).catalog.listProducts({ category: category?.handle, q: next.q || undefined, sort: next.sort, ...BANDS[next.band] });
      if (id === request.current) setPage(result);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  useEffect(() => {
    const fromUrl = readFilters();
    setFilters(fromUrl);
    if (toQueryString(fromUrl)) void load(fromUrl);
    // The header's search box sits outside this island: show what was searched for.
    const box = document.querySelector<HTMLInputElement>('#navq');
    if (box && fromUrl.q) box.value = fromUrl.q;
  }, []);

  function update(patch: Partial<Filters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    window.history.replaceState(null, '', `${window.location.pathname}${toQueryString(next)}`);
    void load(next);
  }

  const total = categories.reduce((sum, item) => sum + item.productCount, 0);
  const keep = toQueryString(filters, false);
  const aisles = [{ handle: null as string | null, name: tc('allSupplies'), count: total }, ...categories.map((item) => ({ handle: item.handle as string | null, name: item.name, count: item.productCount }))];
  const title = filters.q ? t('resultsFor', { query: filters.q }) : (category?.name ?? tc('allSupplies'));
  const count = page.totalCount;
  const filtered = Boolean(filters.q) || filters.band !== 'any';

  return (
    <div class="shop">
      <aside class="side" aria-label={t('filters')}>
        <div>
          <h2 class="side-h">{t('aisle')}</h2>
          <div class="flist">
            {aisles.map((aisle) => {
              const active = (category?.handle ?? null) === aisle.handle;
              return (
                <a key={aisle.handle ?? 'all'} class={active ? 'fbtn on' : 'fbtn'} href={`${to(aisle.handle ? `/shop/${aisle.handle}` : '/shop')}${keep}`} aria-current={active ? 'page' : undefined}>
                  <span>{aisle.name}</span>
                  <small>{aisle.count}</small>
                </a>
              );
            })}
          </div>
        </div>
        <div>
          <h2 class="side-h">{t('pricePerCase')}</h2>
          <div class="flist">
            {(Object.keys(BANDS) as Band[]).map((band) => (
              <button key={band} class={filters.band === band ? 'fbtn on' : 'fbtn'} type="button" aria-pressed={filters.band === band} onClick={() => update({ band })}>
                <span>{t(BAND_LABEL[band])}</span>
              </button>
            ))}
          </div>
        </div>
        <div class="quote">
          <b class="hd text-[18px]">{t('quoteTitle')}</b>
          <span class="fine">{t('quoteBody')}</span>
          <a class="btn sm" href={to('/contact')}>
            {tc('requestQuote')}
          </a>
        </div>
      </aside>

      <div class="main">
        <div class="sec-h mb-6">
          <div>
            <h1 class="hd h2">{title}</h1>
            <span class="mut" aria-live="polite">
              {count} {tc(count === 1 ? 'product' : 'products')} {t('perCaseNote')}
            </span>
          </div>
          <div class="row-c">
            {filters.q && (
              <button class="btn o sm" type="button" onClick={() => update({ q: '' })}>
                <Icon name="x" />
                {t('clearSearch')}
              </button>
            )}
            <label class="sr" for="sort">
              {t('sortBy')}
            </label>
            <select id="sort" class="sel" value={filters.sort} onChange={(event) => update({ sort: event.currentTarget.value as ProductSort })}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {count === 0 && !busy && (
          <div class="empty">
            <b class="hd text-[24px]">{t('emptyTitle')}</b>
            <span class="mut max-w-[420px]">{t('emptyBody')}</span>
            <div class="row-c">
              {filtered && (
                <button class="btn o" type="button" onClick={() => update({ q: '', band: 'any' })}>
                  {t('clearFilters')}
                </button>
              )}
              <a class="btn" href={to('/contact')}>
                {t('askItem')}
              </a>
            </div>
          </div>
        )}

        <div class={busy ? 'pgrid is-busy' : 'pgrid'} aria-busy={busy}>
          {page.items.map((product, index) => (
            <ProductCard key={product.id} locale={locale} product={product} lazy={index >= 4} />
          ))}
        </div>
      </div>
    </div>
  );
}
