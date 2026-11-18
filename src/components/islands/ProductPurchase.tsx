import { useStore } from '@nanostores/preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import { product as productMessages } from '@/i18n/ns/product';
import type { RecurringPolicy } from '@/lib/api/types';
import { formatMoney, formatWeekday, nextBusinessDay } from '@/lib/format';
import { boot } from '@/stores/boot';
import { addToCart } from '@/stores/cart';
import { $purchase, purchaseView, updatePurchase, type PurchasableProduct } from '@/stores/purchase';
import { Img, Stepper, intervalLabel, useMounted } from './shared';

/**
 * The interactive parts of a product page. They are separate islands because
 * the design places them in different columns, and they share one selection
 * (`$purchase`): pick a size in the first and the price in the others follows.
 */
interface Props {
  locale: Locale;
  product: PurchasableProduct;
  recurring: RecurringPolicy;
}

const TIER_LABELS = ['tier1', 'tier2', 'tier3'] as const;

function usePurchase({ locale, product, recurring }: Props) {
  const purchase = useStore($purchase);
  const view = purchaseView(product, purchase, recurring);
  const money = (amount: number) => formatMoney({ amount, currency: product.price.currency }, locale);
  const line = () => [{ variantId: view.variant.id, quantity: purchase.quantity, intervalWeeks: view.recurring ? purchase.intervalWeeks : null }];
  return {
    purchase,
    view,
    money,
    add: () => addToCart(locale, line(), { announce: true }),
    buyNow: async () => {
      await addToCart(locale, line());
      window.location.assign(localizePath(locale, '/checkout'));
    },
  };
}

/** Size pills and the volume price table, in the product's description column. */
export function PurchaseOptions(props: Props) {
  const { locale, product } = props;
  const t = translator(productMessages, locale);
  const { purchase, view, money } = usePurchase(props);

  return (
    <>
      {product.optionName && product.variants.length > 1 && (
        <div class="flex flex-col gap-2">
          <span class="text-[14px] font-semibold">
            {product.optionName}: <span class="mut font-normal">{view.variant.title}</span>
          </span>
          <div class="row-c" role="group" aria-label={product.optionName}>
            {product.variants.map((variant, index) => (
              <button key={variant.id} class={index === purchase.variantIndex ? 'pill on' : 'pill'} type="button" aria-pressed={index === purchase.variantIndex} onClick={() => updatePurchase({ variantIndex: index })}>
                {variant.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div class="flex flex-col gap-2">
        <span class="text-[14px] font-semibold">{t('tiersTitle')}</span>
        <div class="tiers">
          {view.variant.priceTiers.map((tier, index) => (
            <div key={tier.minQuantity} class={index === view.tierIndex ? 'tier on' : 'tier'}>
              {TIER_LABELS[index] ? t(TIER_LABELS[index]) : `${tier.minQuantity}+`}
              <b>{money(tier.price.amount)}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** The purchase panel: price, delivery promise, one-time or recurring, quantity and the two calls to action. */
export function BuyPanel(props: Props) {
  const { locale, product, recurring } = props;
  const t = translator(productMessages, locale);
  const tc = translator(common, locale);
  const { purchase, view, money, add, buyNow } = usePurchase(props);
  const mounted = useMounted();

  useEffect(() => boot(locale), [locale]);

  return (
    <aside class="buy" aria-label={t('purchaseOptions')}>
      <div>
        <div class="pc-p">
          <span class="price text-[34px]">{money(view.unitAmount)}</span>
          <span class="unit">
            {t('per')} {product.unitLabel}
          </span>
        </div>
        {view.savedAmount > 0 && <span class="pillx g mt-1.5">{t('youSave', { amount: money(view.savedAmount) })}</span>}
      </div>
      <div class="eta">
        <Icon name="truck" />
        <span>
          <b>{t('etaLead', { date: mounted ? formatWeekday(nextBusinessDay(), locale) : tc('nextBusinessDay') })}</b> {t('etaTail')}
        </span>
      </div>
      <span class="pillx g self-start">
        <Icon name="check" />
        {t('inStock')}
      </span>
      <div class="choice">
        <button class={view.recurring ? 'mode' : 'mode on'} type="button" aria-pressed={!view.recurring} onClick={() => updatePurchase({ mode: 'once' })}>
          <span class="radio" />
          <span>
            <b>{t('oneTime')}</b>
          </span>
        </button>
        <button class={view.recurring ? 'mode on' : 'mode'} type="button" aria-pressed={view.recurring} onClick={() => updatePurchase({ mode: 'recurring' })}>
          <span class="radio" />
          <span>
            <b>{t('recurring')}</b>
            {t('recurringNote')}
          </span>
        </button>
        {view.recurring && (
          <div class="row-c" role="group" aria-label={tc('every', { interval: '' }).trim()}>
            {recurring.intervalWeeks.map((weeks) => (
              <button key={weeks} class={purchase.intervalWeeks === weeks ? 'pill on' : 'pill'} type="button" aria-pressed={purchase.intervalWeeks === weeks} onClick={() => updatePurchase({ intervalWeeks: weeks })}>
                {tc('every', { interval: intervalLabel(locale, weeks) })}
              </button>
            ))}
          </div>
        )}
      </div>
      <div class="sp">
        <Stepper locale={locale} quantity={purchase.quantity} min={1} onChange={(quantity) => updatePurchase({ quantity })} />
        <span class="unit">
          {tc('total')} <b class="hd text-[20px] text-ink">{money(view.totalAmount)}</b>
        </span>
      </div>
      <div class="buy-cta" data-buy-cta>
        <button class="btn full" type="button" onClick={() => void add()}>
          <Icon name="cart" />
          {tc('addToCart')}
        </button>
        <button class="btn y full" type="button" onClick={() => void buyNow()}>
          {t('buyNow')}
        </button>
      </div>
      <span class="fine text-center">
        {t('bulkQuestion')}{' '}
        <a class="lnk inline min-h-0" href={localizePath(locale, '/contact')}>
          {tc('requestQuote')}
        </a>
      </span>
    </aside>
  );
}

/** The sticky bar that takes over when the panel's buttons scroll out of view. */
export function BuyBar(props: Props) {
  const { locale, product } = props;
  const t = translator(productMessages, locale);
  const tc = translator(common, locale);
  const { purchase, view, money, add, buyNow } = usePurchase(props);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const target = document.querySelector('[data-buy-cta]');
    if (!target || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => setShown(!entries[entries.length - 1]?.isIntersecting), { rootMargin: '-96px 0px 0px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const meta = [view.variant.title, product.unitLabel, view.recurring ? tc('every', { interval: intervalLabel(locale, purchase.intervalWeeks) }).toLowerCase() : null].filter(Boolean).join(' · ');

  return (
    <div class={shown ? 'buybar on' : 'buybar'} role="region" aria-label={t('quickAdd')} inert={!shown}>
      <div class="wrap buybar-in">
        <Img media={product.image} alt="" sizes="54px" />
        <div class="bb-t">
          <b>{product.title}</b>
          <span class="fine">{meta}</span>
        </div>
        <div class="bb-p">
          <span class="price">{money(view.totalAmount)}</span>
          <span class="unit">{tc('each', { price: money(view.unitAmount) })}</span>
        </div>
        <Stepper locale={locale} quantity={purchase.quantity} min={1} onChange={(quantity) => updatePurchase({ quantity })} />
        <button class="btn bb-add" type="button" onClick={() => void add()}>
          <Icon name="cart" />
          {tc('addToCart')}
        </button>
        <button class="btn y bb-buy" type="button" onClick={() => void buyNow()}>
          {t('buyNow')}
        </button>
      </div>
    </div>
  );
}
