import { useStore } from '@nanostores/preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import { confirm } from '@/i18n/ns/confirm';
import { getApi, isApiError } from '@/lib/api';
import type { Order } from '@/lib/api/types';
import { formatMoney, formatWeekday } from '@/lib/format';
import { boot } from '@/stores/boot';
import { $session } from '@/stores/session';
import { Img } from './shared';

type State = { status: 'loading' } | { status: 'ready'; order: Order } | { status: 'missing' } | { status: 'failed' };

/**
 * The page after placing an order. The order number travels in the query
 * string (`?order=IP-48300`), so the page is static and the order is read in
 * the browser; until then the server's placeholder holds the space.
 */
export function ConfirmationPage({ locale }: { locale: Locale }) {
  const t = translator(confirm, locale);
  const tc = translator(common, locale);
  const to = (path: string) => localizePath(locale, path);

  const session = useStore($session);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => boot(locale), [locale]);

  useEffect(() => {
    const number = new URLSearchParams(window.location.search).get('order');
    if (!number) {
      setState({ status: 'missing' });
      return;
    }
    let stale = false;
    getApi(locale)
      .account.getOrder(number)
      .then((order) => {
        if (!stale) setState({ status: 'ready', order });
      })
      .catch((error: unknown) => {
        if (!stale) setState({ status: isApiError(error) && error.code === 'not_found' ? 'missing' : 'failed' });
      });
    return () => {
      stale = true;
    };
  }, [locale]);

  if (state.status === 'loading') {
    return (
      <div class="min-h-[560px]" aria-busy="true">
        <span class="sr" role="status">
          {tc('loading')}
        </span>
      </div>
    );
  }

  if (state.status !== 'ready') {
    return (
      <div class="empty">
        <h1 class="hd text-[26px]">{state.status === 'missing' ? t('notFoundTitle') : tc('genericError')}</h1>
        {state.status === 'missing' && <span class="mut">{t('notFoundBody')}</span>}
        <a class="btn" href={to('/shop')}>
          {tc('shopSupplies')}
        </a>
      </div>
    );
  }

  const { order } = state;

  return (
    <div class="confirm">
      <span class="okdot">
        <Icon name="check" />
      </span>
      <span class="eyebrow">{tc('orderNumber', { number: order.number })}</span>
      <h1 class="hd h2">{t('title')}</h1>
      <p class="mut max-w-[560px] text-[18px]">
        {t('thanks')} {order.email ?? t('yourEmail')} {t('thanksTail')}
      </p>

      <div class="card w-full text-left">
        <div class="sp">
          <b class="hd text-[20px]">{t('whatYouOrdered')}</b>
          <b class="price">{formatMoney(order.totals.total, locale)}</b>
        </div>
        <div class="flex flex-col gap-2.5">
          {order.lines.map((line) => (
            <div class="mini" key={`${line.variantId}:${line.intervalWeeks ?? 'once'}`}>
              <Img media={line.image} alt="" sizes="48px" />
              <span class="flex-1">{line.title}</span>
              <span class="fine">{tc('qty', { qty: line.quantity })}</span>
            </div>
          ))}
        </div>
        <div class="eta">
          <Icon name="truck" />
          <span>
            {t('estimated')} <b>{order.fulfillment.estimatedDate ? formatWeekday(order.fulfillment.estimatedDate, locale) : tc('nextBusinessDay')}</b>
          </span>
        </div>
      </div>

      {order.hasRecurring && (
        <>
          <div class="note w-full text-left">
            <Icon name="repeat" />
            <span>{t('recurringNote')}</span>
          </div>
          <a class="btn" href={`${to('/account')}?tab=recurring`}>
            {t('manageRecurring')}
          </a>
        </>
      )}

      {order.guest && session === null && (
        <div class="card w-full border-0 bg-navy text-left text-white">
          <b class="hd text-[22px]">{t('againTitle')}</b>
          <span class="text-mist">{t('againBody')}</span>
          <div class="row-c">
            <a class="btn y" href={to('/account/sign-in')}>
              {t('createAccount')}
            </a>
            <a class="btn ow" href={to('/shop')}>
              {tc('keepShopping')}
            </a>
          </div>
        </div>
      )}

      <a class="lnk" href={to('/')}>
        {tc('backHome')}
      </a>
    </div>
  );
}
