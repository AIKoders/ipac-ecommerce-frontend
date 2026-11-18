import { useEffect } from 'preact/hooks';
import type { Locale } from '@/i18n';
import type { ProductSummary } from '@/lib/api/types';
import { boot } from '@/stores/boot';
import { ProductCard } from './ProductCard';

/** A list of product cards, as a wrapping grid or a single scrolling row. */
export function ProductGrid({ locale, products, layout = 'grid', eager = 0 }: { locale: Locale; products: ProductSummary[]; layout?: 'grid' | 'row'; eager?: number }) {
  useEffect(() => boot(locale), [locale]);
  return (
    <div class={layout === 'row' ? 'prow' : 'pgrid'}>
      {products.map((product, index) => (
        <ProductCard key={product.id} locale={locale} product={product} lazy={index >= eager} />
      ))}
    </div>
  );
}
