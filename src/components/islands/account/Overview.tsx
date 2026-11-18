import { useStore } from '@nanostores/preact';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { account } from '@/i18n/ns/account';
import { common } from '@/i18n/ns/common';
import type { AccountOverview, NextDelivery, Order, RestockSuggestion } from '@/lib/api/types';
import { formatDate, formatMoney, formatWeekday } from '@/lib/format';
import { $cart, addToCart, oneTimeLine, setQuantity } from '@/stores/cart';
import { ProductCard } from '../ProductCard';
import { Img, Stepper, intervalLabel } from '../shared';
import type { AccountActions } from './model';
import { Thumbs, itemCountLabel } from './parts';
import { Tracker } from './Tracker';

interface PanelProps {
  locale: Locale;
  actions: AccountActions;
  /** Id of the order or schedule a request is in flight for. */
  busy: string | null;
}

/** The dashboard's first section: what is on its way, the last order, what is running low and what to buy again. */
export function Overview({ locale, overview, actions, busy }: PanelProps & { overview: AccountOverview }) {
  const t = translator(account, locale);
  return (
    <>
      <div class="dash">
        <NextPanel locale={locale} next={overview.next} actions={actions} busy={busy} />
        <LastOrderPanel locale={locale} order={overview.lastOrder} actions={actions} busy={busy} />
      </div>

      <section class="pnl">
        <div class="sp flex-wrap">
          <div>
            <span class="eyebrow">{t('smartRestock')}</span>
            <h2 class="hd">{t('runningLow')}</h2>
          </div>
          <span class="fine">{t('estimated')}</span>
        </div>
        {overview.restock.length === 0 ? (
          <span class="mut">{t('noLow')}</span>
        ) : (
          <div>
            {overview.restock.map((suggestion) => (
              <RestockRow key={suggestion.product.id} locale={locale} suggestion={suggestion} />
            ))}
          </div>
        )}
      </section>

      {overview.buyAgain.length > 0 && (
        <section>
          <h2 class="hd mb-4 text-[24px]">{t('buyAgain')}</h2>
          <div class="pgrid">
            {overview.buyAgain.map((product) => (
              <ProductCard key={product.id} locale={locale} product={product} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** The navy panel: the open order, or else the next recurring delivery. */
function NextPanel({ locale, next, actions, busy }: PanelProps & { next: NextDelivery | null }) {
  const t = translator(account, locale);
  const tc = translator(common, locale);

  if (!next) {
    return (
      <section class="pnl nv">
        <span class="eyebrow text-yellow">{tc('nextDelivery')}</span>
        <h2 class="hd text-[30px]">{t('nothingOnWay')}</h2>
        <span class="text-mist">{t('nothingOnWayBody')}</span>
        <a class="btn y sm self-start" href={localizePath(locale, '/shop')}>
          {tc('shopSupplies')}
        </a>
      </section>
    );
  }

  if (next.kind === 'order') {
    const { order } = next;
    const { status, estimatedDate } = order.fulfillment;
    const out = status === 'out_for_delivery';
    // An order without a promised date yet says where it stands instead.
    const arriving = out ? t('arrivingToday') : estimatedDate ? t('arriving', { date: formatWeekday(estimatedDate, locale) }) : tc('statusProcessing');
    return (
      <section class="pnl nv">
        <div class="sp flex-wrap">
          <span class="eyebrow text-yellow">{out ? tc('statusOutForDelivery') : t('onItsWay')}</span>
          <span class="pillx g">
            <Icon name="truck" />
            {arriving}
          </span>
        </div>
        <h2 class="hd text-[30px]">{tc('orderNumber', { number: order.number })}</h2>
        <Thumbs lines={order.lines} />
        <Tracker locale={locale} status={status} />
        <div class="row-c">
          <button class="btn y sm" type="button" onClick={() => actions.open('orders')}>
            {t('viewOrder')}
          </button>
        </div>
      </section>
    );
  }

  const { subscription } = next;
  return (
    <section class="pnl nv" aria-busy={busy === subscription.id}>
      <div class="sp flex-wrap">
        <span class="eyebrow text-yellow">{t('nextRecurring')}</span>
        {subscription.nextDeliveryAt && (
          <span class="pillx g">
            <Icon name="truck" />
            {t('arriving', { date: formatDate(subscription.nextDeliveryAt, locale) })}
          </span>
        )}
      </div>
      <h2 class="hd text-[30px]">{tc('every', { interval: intervalLabel(locale, subscription.intervalWeeks) })}</h2>
      <Thumbs lines={subscription.lines} />
      {/* A delivery that has not been packed yet is at the tracker's first step. */}
      <Tracker locale={locale} status="pending" />
      <div class="row-c">
        <button class="btn y sm" type="button" onClick={() => actions.open('recurring')}>
          {t('manageSchedule')}
        </button>
        <button class="btn ow sm" type="button" onClick={() => actions.skipNext(subscription)}>
          {t('skipThis')}
        </button>
      </div>
    </section>
  );
}

function LastOrderPanel({ locale, order, actions, busy }: PanelProps & { order: Order | null }) {
  const t = translator(account, locale);
  const tc = translator(common, locale);

  if (!order) {
    return (
      <section class="pnl">
        <span class="eyebrow">{tc('reorderOneClick')}</span>
        <h2 class="hd text-[30px]">{t('noOrders')}</h2>
        <span class="mut">{t('noOrdersBody')}</span>
        <a class="btn sm self-start" href={localizePath(locale, '/shop')}>
          {tc('shopSupplies')}
        </a>
      </section>
    );
  }

  return (
    <section class="pnl" aria-busy={busy === order.id}>
      <div class="sp">
        <span class="eyebrow">{tc('reorderOneClick')}</span>
        <span class="fine">{formatDate(order.placedAt, locale)}</span>
      </div>
      <h2 class="hd text-[30px]">{tc('orderNumber', { number: order.number })}</h2>
      <Thumbs lines={order.lines} />
      <div class="sp mt-auto">
        <span class="mut">{itemCountLabel(locale, order.itemCount)}</span>
        <b class="price">{formatMoney(order.totals.total, locale)}</b>
      </div>
      <div class="row-c">
        <button class="btn" type="button" onClick={() => actions.reorder(order)}>
          <Icon name="repeat" />
          {tc('reorderAll')}
        </button>
        <button class="btn o" type="button" onClick={() => actions.makeRecurring(order)}>
          {tc('makeRecurring')}
        </button>
      </div>
    </section>
  );
}

/** One product the shopper is likely running low on, with the same add-to-cart control as a product card. */
function RestockRow({ locale, suggestion }: { locale: Locale; suggestion: RestockSuggestion }) {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  const { product, due } = suggestion;
  const line = oneTimeLine(useStore($cart), product.defaultVariantId);

  return (
    <div class="low">
      <a class="low-i" href={localizePath(locale, `/products/${product.handle}`)} aria-label={product.title}>
        <Img media={product.image} alt="" sizes="64px" />
      </a>
      <div class="flex min-w-0 flex-col gap-1.5">
        <div class="row-c gap-2">
          <b>{product.title}</b>
          {due && <span class="pillx yl">{t('restock')}</span>}
        </div>
        {/* Decorative: the line under it says the same in words. */}
        <div class={due ? 'meter due' : 'meter'} aria-hidden="true">
          <i style={{ width: `${suggestion.percentLeft}%` }} />
        </div>
        <span class="fine">
          {due ? t('timeToRestock') : t('daysLeft', { days: suggestion.daysLeft })} · {t('lastOrdered', { date: formatDate(suggestion.lastOrderedAt, locale) })}
        </span>
      </div>
      <div class="low-a">
        <span class="price text-[18px]">{formatMoney(product.price, locale)}</span>
        {line ? (
          <Stepper locale={locale} quantity={line.quantity} onChange={(quantity) => void setQuantity(locale, line.id, quantity)} />
        ) : (
          <button class="add" type="button" onClick={() => void addToCart(locale, [{ variantId: product.defaultVariantId, quantity: 1 }])} aria-label={tc('addNameToCart', { name: product.title })}>
            <Icon name="plus" />
            {tc('add')}
          </button>
        )}
      </div>
    </div>
  );
}
