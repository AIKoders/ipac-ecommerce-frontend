import { translator, type Locale } from '@/i18n';
import { account } from '@/i18n/ns/account';
import { common } from '@/i18n/ns/common';
import type { Subscription } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/format';
import { intervalLabel } from '../shared';
import type { AccountActions } from './model';
import { LineItems } from './parts';

interface Props {
  locale: Locale;
  subscriptions: Subscription[];
  /** The schedules the store offers, in weeks. */
  intervals: number[];
  actions: AccountActions;
  /** Id of the schedule a request is in flight for. */
  busy: string | null;
}

/** Recurring orders: each schedule with its frequency, and the controls to skip, pause or cancel it. */
export function Recurring({ locale, subscriptions, intervals, actions, busy }: Props) {
  const t = translator(account, locale);
  const tc = translator(common, locale);

  return (
    <>
      <div class="sp flex-wrap">
        <h2 class="hd text-[28px]">{tc('recurringOrders')}</h2>
        <span class="pillx g">{t('recurringOff')}</span>
      </div>

      {subscriptions.length === 0 ? (
        <div class="empty">
          <b class="hd text-[22px]">{t('noRecurring')}</b>
          <span class="mut max-w-[440px]">{t('noRecurringBody')}</span>
          <button class="btn" type="button" onClick={() => actions.open('orders')}>
            {t('goOrders')}
          </button>
        </div>
      ) : (
        <div class="stack">
          {subscriptions.map((subscription) => (
            <ScheduleCard key={subscription.id} locale={locale} subscription={subscription} intervals={intervals} actions={actions} busy={busy === subscription.id} />
          ))}
        </div>
      )}
    </>
  );
}

function ScheduleCard({ locale, subscription, intervals, actions, busy }: { locale: Locale; subscription: Subscription; intervals: number[]; actions: AccountActions; busy: boolean }) {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  const active = subscription.status === 'active';
  const current = subscription.intervalWeeks;
  // A schedule on an interval the store no longer offers still shows its own as the selected one.
  const options = intervals.includes(current) ? intervals : [...intervals, current].sort((a, b) => a - b);

  return (
    <article class="ord" aria-busy={busy}>
      <div class="ord-h">
        <dl>
          <div>
            <dt>{tc('nextDelivery')}</dt>
            <dd>{subscription.nextDeliveryAt ? formatDate(subscription.nextDeliveryAt, locale) : tc('statusPaused')}</dd>
          </div>
          <div>
            <dt>{t('eachDelivery')}</dt>
            <dd>{formatMoney(subscription.perDelivery, locale)}</dd>
          </div>
          <div>
            <dt>{t('schedule')}</dt>
            <dd>{tc('every', { interval: intervalLabel(locale, current) })}</dd>
          </div>
        </dl>
        <span class={active ? 'pillx g' : 'pillx'}>{tc(active ? 'statusActive' : 'statusPaused')}</span>
      </div>
      <div class="ord-b">
        <LineItems locale={locale} lines={subscription.lines} />
      </div>
      <div class="ord-f">
        <div class="flex flex-col gap-1.5">
          <span class="fine">{t('deliverEvery')}</span>
          <div class="seg" role="group" aria-label={t('frequency')}>
            {options.map((weeks) => (
              <button key={weeks} class={weeks === current ? 'on' : undefined} type="button" aria-pressed={weeks === current} onClick={() => weeks !== current && actions.setIntervalWeeks(subscription, weeks)}>
                {intervalLabel(locale, weeks)}
              </button>
            ))}
          </div>
        </div>
        <div class="row-c">
          {active && (
            <button class="btn o sm" type="button" onClick={() => actions.skipNext(subscription)}>
              {tc('skipNext')}
            </button>
          )}
          <button class="btn o sm" type="button" onClick={() => actions.setStatus(subscription, active ? 'paused' : 'active')}>
            {tc(active ? 'pause' : 'resume')}
          </button>
          <button class="lnk text-[14px]" type="button" onClick={() => actions.cancel(subscription)}>
            {tc('cancel')}
          </button>
        </div>
      </div>
    </article>
  );
}
