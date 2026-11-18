import { localizePath, translator, type Locale } from '@/i18n';
import { product as productMessages } from '@/i18n/ns/product';
import type { ProductSummary } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';
import { addToCart } from '@/stores/cart';
import { Img } from './shared';

/** "Frequently bought together": the product and its companions, added to the cart in one go. */
export function FrequentlyBought({ locale, products }: { locale: Locale; products: ProductSummary[] }) {
  const t = translator(productMessages, locale);
  const first = products[0];
  if (!first || products.length < 2) return null;
  const total = { amount: products.reduce((sum, product) => sum + product.price.amount, 0), currency: first.price.currency };

  return (
    <div class="fbt">
      <div class="fbt-i">
        {products.map((product, index) => (
          <>
            {index > 0 && (
              <span class="plus" aria-hidden="true">
                +
              </span>
            )}
            <a href={localizePath(locale, `/products/${product.handle}`)}>
              <Img media={product.image} alt="" sizes="104px" />
              <span>{product.title}</span>
              <b>{formatMoney(product.price, locale)}</b>
            </a>
          </>
        ))}
      </div>
      <div class="ml-auto flex flex-col items-start gap-2.5">
        <span class="unit">{t('fbtTotal')}</span>
        <span class="price">{formatMoney(total, locale)}</span>
        <button class="btn" type="button" onClick={() => void addToCart(locale, products.map((product) => ({ variantId: product.defaultVariantId, quantity: 1 })), { announce: true })}>
          {t('fbtAdd')}
        </button>
      </div>
    </div>
  );
}
