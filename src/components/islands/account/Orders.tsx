import { useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { account } from '@/i18n/ns/account';
import { common } from '@/i18n/ns/common';
import type { Order } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/format';
import type { AccountActions } from './model';
import { LineItems, itemCountLabel } from './parts';
import { Tracker } from './Tracker';

type Filter = 'all' | 'open' | 'completed';

interface Props {
  locale: Locale;
  orders: Order[];
  actions: AccountActions;
  /** Id of the order a request is in flight for. */
  busy: string | null;
}

/** The order history, filtered in place: the whole list is already here. */
export function Orders({ locale, orders, actions, busy }: Props) {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  const [filter, setFilter] = useState<Filter>('all');

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: t('all') },
    { value: 'open', label: tc('statusProcessing') },
    { value: 'completed', label: tc('statusDelivered') },
  ];
  const shown = filter === 'all' ? orders : orders.filter((order) => order.status === filter);

  return (
    <>
      <div class="sp flex-wrap">
        <h2 class="hd text-[28px]">{tc('orders')}</h2>
        <div class="row-c">
          {filters.map((option) => (
            <button key={option.value} class={filter === option.value ? 'pill on' : 'pill'} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div class="empty">
          <b class="hd text-[22px]">{t('noOrders')}</b>
          <a class="btn" href={localizePath(locale, '/shop')}>
            {tc('shopSupplies')}
          </a>
        </div>
      ) : shown.length === 0 ? (
        <div class="empty">
          <b class="hd text-[22px]">{t('noOrdersStatus')}</b>
        </div>
      ) : (
        <div class="stack">
          {shown.map((order) => (
            <OrderCard key={order.id} locale={locale} order={order} actions={actions} busy={busy === order.id} />
          ))}
        </div>
      )}
    </>
  );
}

function OrderCard({ locale, order, actions, busy }: { locale: Locale; order: Order; actions: AccountActions; busy: boolean }) {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  const canceled = order.status === 'canceled';
  const status =
    order.status === 'completed'
      ? { class: 'pillx g', label: tc('statusDelivered') }
      : canceled
        ? { class: 'pillx', label: tc('statusCanceled') }
        : { class: 'pillx yl', label: tc(order.fulfillment.status === 'out_for_delivery' ? 'statusOutForDelivery' : 'statusProcessing') };

  return (
    <article class="ord" aria-label={tc('orderNumber', { number: order.number })} aria-busy={busy}>
      <div class="ord-h">
        <dl>
          <div>
            <dt>{tc('order')}</dt>
            <dd>{order.number}</dd>
          </div>
          <div>
            <dt>{t('placed')}</dt>
            <dd>{formatDate(order.placedAt, locale)}</dd>
          </div>
          <div>
            <dt>{tc('total')}</dt>
            <dd>{formatMoney(order.totals.total, locale)}</dd>
          </div>
          <div>
            <dt>{t('items')}</dt>
            <dd>{itemCountLabel(locale, order.itemCount)}</dd>
          </div>
        </dl>
        <span class={status.class}>{status.label}</span>
      </div>
      {/* A canceled order is not on its way anywhere. */}
      {!canceled && (
        <div class="ord-t">
          <Tracker locale={locale} status={order.fulfillment.status} light />
        </div>
      )}
      <div class="ord-b">
        <LineItems locale={locale} lines={order.lines} />
        <div class="row-c">
          <button class="btn sm" type="button" onClick={() => actions.reorder(order)}>
            <Icon name="repeat" />
            {tc('reorderAll')}
          </button>
          <button class="btn o sm" type="button" onClick={() => actions.makeRecurring(order)}>
            {tc('makeRecurring')}
          </button>
          <button class="lnk text-[14px]" type="button" onClick={() => actions.open('billing')}>
            {t('invoice')}
          </button>
        </div>
      </div>
    </article>
  );
}
