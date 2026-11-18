import { useStore } from '@nanostores/preact';
import { Icon, Star } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import type { ProductSummary } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';
import { $cart, addToCart, oneTimeLine, setQuantity } from '@/stores/cart';
import { Img, Stepper } from './shared';

/**
 * A product card. "Add" puts one case in the cart; from then on the card
 * shows a stepper bound to that cart line, so the shopper can keep adjusting
 * without leaving the list.
 */
export function ProductCard({ locale, product, lazy = true }: { locale: Locale; product: ProductSummary; lazy?: boolean }) {
  const t = translator(common, locale);
  const line = oneTimeLine(useStore($cart), product.defaultVariantId);
  const href = localizePath(locale, `/products/${product.handle}`);

  return (
    <article class={line ? 'pc in' : 'pc'}>
      {product.badge && !line && <span class={product.badge === 'popular' ? 'tag g' : 'tag'}>{t(product.badge === 'popular' ? 'badgePopular' : 'badgeBestSeller')}</span>}
      {line && (
        <span class="incart">
          <Icon name="check" />
          {t('inCart')}
        </span>
      )}
      <a class="pc-img" href={href} tabIndex={-1} aria-hidden="true">
        <Img media={product.image} alt="" sizes="(max-width: 900px) 46vw, 280px" lazy={lazy} />
      </a>
      <div class="pc-b">
        <div class="sp">
          <span class="eyebrow">{product.category.name}</span>
          <span class="rate1" aria-label={t('ratingOutOf5', { rating: product.rating.average.toFixed(1) })}>
            <Star />
            {product.rating.average.toFixed(1)} <span class="unit">({product.rating.count})</span>
          </span>
        </div>
        <a class="pc-n" href={href}>
          {product.title}
        </a>
        <span class="unit">
          {product.unitLabel} {t('fromDot')} {formatMoney(product.bulkPrice, locale)} {t('at10Cases')}
        </span>
        <div class="pc-f">
          <span class="price">{formatMoney(product.price, locale)}</span>
          {line ? (
            <Stepper locale={locale} quantity={line.quantity} onChange={(quantity) => void setQuantity(locale, line.id, quantity)} />
          ) : (
            <button class="add" type="button" onClick={() => void addToCart(locale, [{ variantId: product.defaultVariantId, quantity: 1 }])} aria-label={t('addNameToCart', { name: product.title })}>
              <Icon name="plus" />
              {t('add')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
