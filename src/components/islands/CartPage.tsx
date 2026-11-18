import { useStore } from '@nanostores/preact';
import { useEffect } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { cart as cartMessages } from '@/i18n/ns/cart';
import { common } from '@/i18n/ns/common';
import type { ProductSummary } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';
import { boot } from '@/stores/boot';
import { $cart, setQuantity } from '@/stores/cart';
import { $session } from '@/stores/session';
import { ProductCard } from './ProductCard';
import { Img, Stepper, TotalsRows, intervalLabel, useMounted } from './shared';

const MAX_RECOMMENDATIONS = 4;

/**
 * The cart page: what is left for free local delivery, every line with its
 * quantity, a few things often added before checkout and the order summary.
 * The cart lives in the browser, so the server renders a placeholder of about
 * the same height instead of an empty cart that would flash for returning shoppers.
 */
export function CartPage({ locale, recommendations }: { locale: Locale; recommendations: ProductSummary[] }) {
  const t = translator(cartMessages, locale);
  const tc = translator(common, locale);
  const to = (path: string) => localizePath(locale, path);

  const mounted = useMounted();
  const cart = useStore($cart);
  const session = useStore($session);

  useEffect(() => boot(locale), [locale]);

  if (!mounted || !cart) {
    return (
      <div class="min-h-[480px]" aria-busy="true">
        <span class="sr" role="status">
          {tc('loading')}
        </span>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div class="empty">
        <b class="hd text-[26px]">{t('emptyTitle')}</b>
        <span class="mut">{t('emptyBody')}</span>
        <a class="btn" href={to('/shop')}>
          {tc('shopSupplies')}
        </a>
      </div>
    );
  }

  const inCart = new Set(cart.lines.map((line) => line.variantId));
  const suggested = recommendations.filter((product) => !inCart.has(product.defaultVariantId)).slice(0, MAX_RECOMMENDATIONS);

  return (
    <div class="co">
      <div class="co-main">
        <div class="note t">
          <Icon name="truck" />
          <div class="flex flex-1 flex-col gap-2">
            <b>{cart.freeDelivery.remaining.amount > 0 ? t('freeRemaining', { amount: formatMoney(cart.freeDelivery.remaining, locale) }) : t('freeUnlocked')}</b>
            <div class="prog bg-white">
              <i style={{ width: `${cart.freeDelivery.progress * 100}%` }} />
            </div>
          </div>
        </div>

        <div>
          {cart.lines.map((line) => (
            <div class="line" key={line.id}>
              <a href={to(`/products/${line.handle}`)} aria-label={tc('viewProduct', { name: line.title })}>
                <Img media={line.image} alt="" sizes="92px" />
              </a>
              <div class="flex min-w-0 flex-col items-start gap-1.5">
                <h3>{line.title}</h3>
                <span class="fine">{[line.variantTitle, line.unitLabel, tc('each', { price: formatMoney(line.unitPrice, locale) })].filter(Boolean).join(' · ')}</span>
                {line.intervalWeeks && (
                  <span class="pillx g">
                    <Icon name="repeat" />
                    {tc('recurringLine', { interval: intervalLabel(locale, line.intervalWeeks) })}
                  </span>
                )}
                <button class="lnk text-[14px] font-medium" type="button" aria-label={t('removeName', { name: line.title })} onClick={() => void setQuantity(locale, line.id, 0)}>
                  {tc('remove')}
                </button>
              </div>
              <div class="line-r">
                <b class="price">{formatMoney(line.lineTotal, locale)}</b>
                <Stepper locale={locale} quantity={line.quantity} onChange={(quantity) => void setQuantity(locale, line.id, quantity)} />
              </div>
            </div>
          ))}
        </div>

        {suggested.length > 0 && (
          <section class="mt-7">
            <h2 class="hd mb-4 text-[24px]">{t('recos')}</h2>
            <div class="pgrid">
              {suggested.map((product) => (
                <ProductCard key={product.id} locale={locale} product={product} />
              ))}
            </div>
          </section>
        )}
      </div>

      <aside class="sum" aria-label={tc('orderSummary')}>
        <h2 class="hd text-[22px]">{tc('orderSummary')}</h2>
        <TotalsRows locale={locale} totals={cart.totals} itemCount={cart.itemCount} />
        <a class="btn full" href={to('/checkout')}>
          {tc('checkout')}
          <Icon name="arrowRight" />
        </a>
        {session === null && (
          <span class="fine text-center">
            {t('guestCheckout')} <a class="lnk inline min-h-0" href={`${to('/account/sign-in')}?next=${encodeURIComponent(to('/checkout'))}`}>{tc('signIn')}</a> {t('forSaved')}
          </span>
        )}
      </aside>
    </div>
  );
}
