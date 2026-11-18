import { useStore } from '@nanostores/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/icons';
import { intlLocale, localizePath, translator, type Locale } from '@/i18n';
import { account } from '@/i18n/ns/account';
import { common } from '@/i18n/ns/common';
import { header } from '@/i18n/ns/header';
import { getApi, isApiError } from '@/lib/api';
import type { AccountOverview, BillingProfile, Invoice, NextDelivery, Order, Subscription } from '@/lib/api/types';
import { formatMoney, formatShortDate } from '@/lib/format';
import { boot } from '@/stores/boot';
import { $cart } from '@/stores/cart';
import { $session, signOut } from '@/stores/session';
import { Billing } from './account/Billing';
import { Details } from './account/Details';
import { isTab, type AccountActions, type Tab } from './account/model';
import { Orders } from './account/Orders';
import { Overview } from './account/Overview';
import { Recurring } from './account/Recurring';
import { intervalLabel } from './shared';

/**
 * The signed-in account: everything between the site header and the footer.
 *
 * Who is signed in is only known in the browser, so the page is prerendered as
 * an empty block of the same height and decides after it mounts: a guest is
 * sent to sign in (and back here afterwards), a customer gets the dashboard.
 * The section on screen is in `?tab=`, so each one can be linked to. This
 * component owns the account's data; the sections in ./account draw it and ask
 * for changes through `AccountActions`.
 */
const NAV: { tab: Tab; icon: IconName }[] = [
  { tab: 'overview', icon: 'grid' },
  { tab: 'orders', icon: 'box' },
  { tab: 'recurring', icon: 'repeat' },
  { tab: 'billing', icon: 'tag' },
  { tab: 'details', icon: 'user' },
];

/** Height the sticky site header covers: the same offset as `scroll-padding-top` in global.css. */
const HEADER_OFFSET = 100;

interface Props {
  locale: Locale;
  /** The schedules a recurring order can be set to, in weeks (a store setting). */
  intervals: number[];
}

export function AccountPage({ locale, intervals }: Props) {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  const th = translator(header, locale);
  const to = (path: string) => localizePath(locale, path);
  const api = getApi(locale);

  const session = useStore($session);
  /** Null until the page is in the browser and has read `?tab=`. */
  const [tab, setTab] = useState<Tab | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [billing, setBilling] = useState<BillingProfile | null>(null);
  /** Id of the order or schedule a change is in flight for. */
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const working = useRef(false);
  const leaving = useRef(false);
  /** How the section on screen was reached, for the effect that follows a change of section. */
  const arrival = useRef<'nav' | 'content' | null>(null);
  const side = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const customer = session?.customer;

  useEffect(() => {
    boot(locale);
    const requested = new URLSearchParams(window.location.search).get('tab');
    setTab(isTab(requested) ? requested : 'overview');
  }, [locale]);

  // A guest is sent to sign in, and comes back to the section they asked for.
  useEffect(() => {
    if (tab === null || session !== null || leaving.current) return;
    window.location.replace(`${to('/account/sign-in')}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [tab, session]);

  function fail(error: unknown): void {
    // The session ended on the server: the store follows, which sends the shopper to sign in.
    if (isApiError(error) && error.code === 'unauthenticated') $session.set(null);
    else setFailed(true);
  }

  const loadOverview = () => api.account.getOverview().then(setOverview, fail);
  const loadSubscriptions = () => api.account.listSubscriptions().then(setSubscriptions, fail);

  function loadAll(): void {
    void loadOverview();
    void loadSubscriptions();
    void api.account.listOrders().then(setOrders, fail);
    void api.account.listInvoices().then(setInvoices, fail);
    void api.account.getBilling().then(setBilling, fail);
  }

  useEffect(() => {
    if (!customer) return;
    loadAll();
    // A page restored from the back/forward cache may be showing orders from before a checkout.
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) loadAll();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [customer?.id]);

  // After a change of section: keep its top in view, and move focus there when the control that was used is gone.
  useEffect(() => {
    const element = panel.current;
    const how = arrival.current;
    arrival.current = null;
    if (!element || !how) return;
    if (how === 'content') element.focus({ preventScroll: true });
    if (element.getBoundingClientRect().top < HEADER_OFFSET) element.scrollIntoView();
  }, [tab]);

  // On a phone the sections are a horizontal strip: bring the current one into it.
  useEffect(() => {
    const strip = side.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current]');
    if (!strip || !current) return;
    const box = strip.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.left < box.left || item.right > box.right) strip.scrollLeft += item.left - box.left - 16;
  }, [tab, customer?.id]);

  function select(next: Tab, how: 'nav' | 'content'): void {
    if (next === tab) return;
    arrival.current = how;
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  }

  /** One change at a time: a click while a request is in flight is ignored. */
  async function run(id: string, task: () => Promise<void>): Promise<void> {
    if (working.current) return;
    working.current = true;
    setBusy(id);
    setFailed(false);
    try {
      await task();
    } catch (error) {
      fail(error);
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  /** A change to one schedule: the API's answer replaces it, and the overview (next delivery, counts, restock) is read again. */
  const change = (subscription: Subscription, request: () => Promise<Subscription>) =>
    run(subscription.id, async () => {
      const updated = await request();
      setSubscriptions((list) => list?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
      await loadOverview();
    });

  const actions: AccountActions = {
    open: (next) => select(next, 'content'),
    reorder: (order) =>
      void run(order.id, async () => {
        $cart.set(await api.account.reorder(order.id));
        window.location.assign(to('/cart'));
      }),
    makeRecurring: (order) =>
      void run(order.id, async () => {
        await api.account.createSubscriptionFromOrder(order.id);
        await Promise.all([loadSubscriptions(), loadOverview()]);
        select('recurring', 'content');
      }),
    skipNext: (subscription) => void change(subscription, () => api.account.skipNextDelivery(subscription.id)),
    setIntervalWeeks: (subscription, weeks) => void change(subscription, () => api.account.updateSubscription(subscription.id, { intervalWeeks: weeks })),
    setStatus: (subscription, status) => void change(subscription, () => api.account.updateSubscription(subscription.id, { status })),
    cancel: (subscription) =>
      void run(subscription.id, async () => {
        await api.account.cancelSubscription(subscription.id);
        setSubscriptions((list) => list?.filter((item) => item.id !== subscription.id) ?? null);
        // The card and the button that was pressed are gone.
        panel.current?.focus({ preventScroll: true });
        await loadOverview();
      }),
  };

  async function leave(): Promise<void> {
    leaving.current = true;
    try {
      await signOut(locale);
      window.location.assign(to('/'));
    } catch {
      leaving.current = false;
      setFailed(true);
    }
  }

  if (tab === null || !customer) {
    return (
      <main id="main" class="page" aria-busy="true">
        <div class="wrap min-h-screen">
          <p class="sr" role="status">
            {tab !== null && session === null && !leaving.current ? t('redirecting') : tc('loading')}
          </p>
        </div>
      </main>
    );
  }

  const labels: Record<Tab, string> = { overview: th('overview'), orders: tc('orders'), recurring: tc('recurringOrders'), billing: t('billing'), details: t('details') };
  const stats = overview?.stats;
  const next = overview ? nextDeliveryStat(locale, overview.next) : null;
  const waiting = (
    <div class="min-h-screen" aria-busy="true">
      <span class="sr" role="status">
        {tc('loading')}
      </span>
    </div>
  );

  let content = waiting;
  if (tab === 'overview' && overview) content = <Overview locale={locale} overview={overview} actions={actions} busy={busy} />;
  else if (tab === 'orders' && orders) content = <Orders locale={locale} orders={orders} actions={actions} busy={busy} />;
  else if (tab === 'recurring' && subscriptions) content = <Recurring locale={locale} subscriptions={subscriptions} intervals={intervals} actions={actions} busy={busy} />;
  else if (tab === 'billing' && billing && invoices) content = <Billing locale={locale} customer={customer} billing={billing} invoices={invoices} />;
  else if (tab === 'details') content = <Details locale={locale} customer={customer} />;

  return (
    <>
      <section class="acct-hd">
        <span class="dot" aria-hidden="true" />
        <div class="wrap">
          <div class="acct-top">
            <span class="avatar" aria-hidden="true">
              {customer.firstName ? customer.firstName.charAt(0).toLocaleUpperCase(intlLocale[locale]) : 'i'}
            </span>
            <div class="flex min-w-[220px] flex-1 flex-col gap-1">
              {customer.company && <span class="eyebrow text-yellow">{customer.company}</span>}
              <h1 class="hd h2">{customer.firstName ? `${t('greeting')} ${customer.firstName}.` : t('greetingNoName')}</h1>
              <span class="text-haze">{customer.email}</span>
            </div>
            <div class="row-c">
              <a class="btn y" href={to('/shop')}>
                {tc('shopSupplies')}
                <Icon name="arrowRight" />
              </a>
              <button class="btn ow" type="button" onClick={() => void leave()}>
                {tc('signOut')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <main id="main" class="page pt-0">
        <div class="wrap">
          <div class="acct-stats" aria-busy={!overview}>
            <Stat label={tc('orders')} value={stats && String(stats.orderCount)} note={t('statOrdersNote')} />
            <Stat label={t('spent')} value={stats && formatMoney(stats.totalSpent, locale)} note={t('spentNote')} />
            <Stat label={t('recurring')} value={stats && String(stats.activeSubscriptions)} note={t('recurringNote')} />
            <Stat label={tc('nextDelivery')} value={next?.value} note={next?.note} green />
          </div>

          <div class="acct">
            <nav class="acct-side" aria-label={tc('account')} ref={side}>
              {NAV.map((item) => (
                <button key={item.tab} class={tab === item.tab ? 'an on' : 'an'} type="button" aria-current={tab === item.tab ? 'page' : undefined} onClick={() => select(item.tab, 'nav')}>
                  <Icon name={item.icon} />
                  {labels[item.tab]}
                </button>
              ))}
            </nav>
            <div class="acct-main outline-none" tabIndex={-1} ref={panel}>
              {failed && (
                <p class="note" role="alert">
                  {tc('genericError')}
                </p>
              )}
              {content}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/** A figure of the summary row. Its value is a blank of the same height until the overview arrives, so nothing moves. */
function Stat({ label, value, note, green = false }: { label: string; value: string | undefined; note: string | undefined; green?: boolean }) {
  return (
    <div class={green ? 'stat g' : 'stat'}>
      <small>{label}</small>
      <b>{value ?? ' '}</b>
      <span class="sn">{note ?? ' '}</span>
    </div>
  );
}

/** "Thursday" / "Jueves": the day alone, as a headline. */
function weekdayName(iso: string, locale: Locale): string {
  const name = new Date(iso).toLocaleDateString(intlLocale[locale], { weekday: 'long' });
  return name.charAt(0).toLocaleUpperCase(intlLocale[locale]) + name.slice(1);
}

/** The "Next delivery" figure: the open order first, else the next recurring delivery. */
function nextDeliveryStat(locale: Locale, next: NextDelivery | null): { value: string; note: string } {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  if (!next) return { value: t('none'), note: t('nothingScheduled') };
  if (next.kind === 'order') {
    const { status, estimatedDate } = next.order.fulfillment;
    const value = status === 'out_for_delivery' ? t('today') : estimatedDate ? weekdayName(estimatedDate, locale) : tc('statusProcessing');
    return { value, note: tc('orderNumber', { number: next.order.number }) };
  }
  const { nextDeliveryAt, intervalWeeks } = next.subscription;
  return {
    value: nextDeliveryAt ? formatShortDate(nextDeliveryAt, locale) : tc('statusPaused'),
    note: tc('every', { interval: intervalLabel(locale, intervalWeeks) }).toLocaleLowerCase(intlLocale[locale]),
  };
}
