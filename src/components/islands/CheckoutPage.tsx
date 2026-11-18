import { useStore } from '@nanostores/preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { checkout } from '@/i18n/ns/checkout';
import { common } from '@/i18n/ns/common';
import { getApi, isApiError } from '@/lib/api';
import type { Cart, CheckoutOptions, FulfillmentMethod, PaymentMethod, PlaceOrderInput, Session } from '@/lib/api/types';
import { formatMoney, formatWeekday } from '@/lib/format';
import { boot } from '@/stores/boot';
import { $cart, loadCart, setFulfillment } from '@/stores/cart';
import { $session, loadSession } from '@/stores/session';
import { withLoader } from '@/stores/ui';
import { Img, TotalsRows, useMounted } from './shared';

const DELIVERY = {
  local_delivery: { label: 'delLocal', sub: 'delLocalSub' },
  pickup: { label: 'delPickup', sub: 'delPickupSub' },
  shipping: { label: 'delShip', sub: 'delShipSub' },
} as const satisfies Record<FulfillmentMethod, unknown>;

const PAYMENT = {
  card: { label: 'payCard', sub: 'payCardSub' },
  net_terms: { label: 'payTerms', sub: 'payTermsSub' },
} as const satisfies Record<PaymentMethod, unknown>;

const EMAIL_ERROR_ID = 'checkout-email-error';

const EMPTY_FORM = { email: '', phone: '', company: '', name: '', line1: '', city: '', postalCode: '', notes: '', poNumber: '' };
type FormField = keyof typeof EMPTY_FORM;

const filled = (value: string): string | undefined => value.trim() || undefined;

/**
 * Checkout on one page: contact, delivery and payment, with the order summary
 * beside them. Delivery and payment choices, prices and totals come from the
 * API; picking a delivery method updates the cart so the totals follow.
 *
 * The cart and the session live in the browser, so the server renders a
 * placeholder and the form appears once both are known.
 */
export function CheckoutPage({ locale }: { locale: Locale }) {
  const t = translator(checkout, locale);
  const tc = translator(common, locale);
  const to = (path: string) => localizePath(locale, path);

  const mounted = useMounted();
  const liveCart = useStore($cart);
  const liveSession = useStore($session);

  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [paymentChoice, setPaymentChoice] = useState<PaymentMethod>('card');
  const [emailError, setEmailError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [placing, setPlacing] = useState(false);
  // Placing the order empties the cart (and may sign a guest in): keep showing what was ordered until the confirmation page replaces this one.
  const [placed, setPlaced] = useState<{ cart: Cart; session: Session | null } | null>(null);

  const emailInput = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const optionsRequest = useRef(0);
  // One key per order: a retry after a failure the shopper cannot explain (network, server) reuses it, so the backend can tell a retry from a second order.
  const idempotencyKey = useRef<string | null>(null);

  const cart = placed?.cart ?? liveCart;
  const session = placed ? placed.session : liveSession;
  const customer = session?.customer;

  useEffect(() => boot(locale), [locale]);

  const refreshOptions = useCallback(async () => {
    const id = ++optionsRequest.current;
    try {
      const next = await getApi(locale).checkout.getOptions();
      if (id === optionsRequest.current) setOptions(next);
    } catch {
      if (id === optionsRequest.current) setFailed(true);
    }
  }, [locale]);

  // The local delivery price depends on the subtotal, so the options are read again whenever it changes.
  const subtotal = liveCart && liveCart.lines.length > 0 ? liveCart.totals.subtotal.amount : null;
  useEffect(() => {
    if (subtotal !== null) void refreshOptions();
  }, [subtotal, refreshOptions]);

  // Coming back to this page from the browser's history restores it as it was left: drop the placed order so the real cart shows.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      busy.current = false;
      setPlaced(null);
      setPlacing(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const pending = (
    <div class="min-h-[560px]" aria-busy="true">
      <span class="sr" role="status">
        {tc('loading')}
      </span>
    </div>
  );

  if (!mounted || !cart || session === undefined) return pending;

  if (cart.lines.length === 0) {
    return (
      <div class="empty">
        <b class="hd text-[26px]">{t('empty')}</b>
        <a class="btn" href={to('/shop')}>
          {tc('shopSupplies')}
        </a>
      </div>
    );
  }

  if (!options) {
    if (!failed) return pending;
    return (
      <div class="note" role="alert">
        {tc('genericError')}
      </div>
    );
  }

  const payment = options.payment.includes(paymentChoice) ? paymentChoice : options.payment[0];
  const signInHref = `${to('/account/sign-in')}?next=${encodeURIComponent(to('/checkout'))}`;
  // An account made from a guest's recurring order has no name or company yet.
  const account = customer ? [customer.company, customer.email].filter(Boolean).join(' · ') : '';

  const bind = (field: FormField) => ({
    value: form[field],
    onInput: (event: { currentTarget: HTMLInputElement }) => {
      const { value } = event.currentTarget;
      setForm((current) => ({ ...current, [field]: value }));
    },
  });

  async function pickDelivery(method: FulfillmentMethod) {
    if (method === cart?.fulfillmentMethod) return;
    setFailed(false);
    try {
      await setFulfillment(locale, method);
      await refreshOptions();
    } catch {
      setFailed(true);
    }
  }

  async function placeOrder() {
    if (busy.current || !cart || !payment) return;
    busy.current = true;
    setPlacing(true);
    setEmailError(false);
    setFailed(false);

    const input: PlaceOrderInput = {
      email: customer ? undefined : filled(form.email),
      phone: customer ? undefined : filled(form.phone),
      fulfillmentMethod: cart.fulfillmentMethod,
      shipTo: {
        company: filled(form.company),
        name: filled(form.name),
        line1: filled(form.line1),
        city: filled(form.city),
        postalCode: filled(form.postalCode),
        notes: filled(form.notes),
      },
      // The card fields are never read: this store has no payment provider to tokenize them.
      payment: payment === 'net_terms' ? { method: payment, poNumber: filled(form.poNumber) } : { method: payment },
      idempotencyKey: (idempotencyKey.current ??= crypto.randomUUID()),
    };

    try {
      const order = await withLoader(t('placing'), () => getApi(locale).checkout.placeOrder(input));
      idempotencyKey.current = null;
      setPlaced({ cart, session: session ?? null });
      // The order exists whatever happens to these two; the confirmation page loads them again.
      await Promise.allSettled([loadCart(locale), loadSession(locale)]);
      window.location.assign(`${to('/checkout/confirmation')}?order=${encodeURIComponent(order.number)}`);
    } catch (error) {
      busy.current = false;
      setPlacing(false);
      const rejected = isApiError(error) && error.code === 'invalid' ? error.errors : null;
      // A rejected request created nothing, and the corrected one is a different request: it gets its own key.
      if (rejected) idempotencyKey.current = null;
      if (!customer && rejected?.some((fieldError) => fieldError.field === 'email')) {
        setEmailError(true);
        emailInput.current?.focus();
      } else {
        setFailed(true);
      }
    }
  }

  return (
    <div class="co">
      <div class="co-main">
        <section class="card">
          <div class="card-h">
            <span class="stepn">1</span>
            <h2 class="hd">{tc('contact')}</h2>
          </div>
          {customer ? (
            <div class="note t">
              <Icon name="check" />
              <span>
                {t('signedInAs')} {customer.firstName ? <><b>{customer.firstName}</b> · {account}</> : account}
              </span>
            </div>
          ) : (
            <>
              <div class="note t">
                <Icon name="user" />
                <span>
                  {t('guestNote')} <a class="lnk inline min-h-0" href={signInHref}>{tc('signIn')}</a> {t('guestNoteTail')}
                </span>
              </div>
              <div class="fgrid">
                <div class="flex flex-col gap-1.5">
                  <label class="fld">
                    {t('emailLabel')}
                    <input
                      ref={emailInput}
                      type="email"
                      placeholder={tc('emailPlaceholder')}
                      autocomplete="email"
                      aria-invalid={emailError ? 'true' : undefined}
                      aria-describedby={emailError ? EMAIL_ERROR_ID : undefined}
                      value={form.email}
                      onInput={(event) => {
                        const { value } = event.currentTarget;
                        setEmailError(false);
                        setForm((current) => ({ ...current, email: value }));
                      }}
                    />
                  </label>
                  {emailError && (
                    <span id={EMAIL_ERROR_ID} class="err" role="alert">
                      {t('emailRequired')}
                    </span>
                  )}
                </div>
                <label class="fld">
                  {t('phoneLabel')}
                  <input type="tel" placeholder={t('phonePlaceholder')} autocomplete="tel" {...bind('phone')} />
                </label>
              </div>
              {cart.hasRecurring && (
                <div class="note">
                  <Icon name="repeat" />
                  <span>{t('recurringNote')}</span>
                </div>
              )}
            </>
          )}
        </section>

        <section class="card">
          <div class="card-h">
            <span class="stepn">2</span>
            <h2 class="hd">{tc('delivery')}</h2>
          </div>
          <div class="choice" role="group" aria-label={tc('delivery')}>
            {options.shipping.map((option) => {
              const selected = option.method === cart.fulfillmentMethod;
              const copy = DELIVERY[option.method];
              return (
                <button class={selected ? 'mode on' : 'mode'} type="button" aria-pressed={selected} key={option.method} onClick={() => void pickDelivery(option.method)}>
                  <span class="radio" />
                  <span class="flex-1">
                    <b>{t(copy.label)}</b>
                    {t(copy.sub, { date: option.estimatedDate ? formatWeekday(option.estimatedDate, locale) : tc('nextBusinessDay') })}
                  </span>
                  <b>{option.amount.amount ? formatMoney(option.amount, locale) : tc('free')}</b>
                </button>
              );
            })}
          </div>
          <div class="fgrid">
            <label class="fld">
              {tc('businessName')}
              <input type="text" autocomplete="organization" {...bind('company')} />
            </label>
            <label class="fld">
              {t('contactName')}
              <input type="text" autocomplete="name" {...bind('name')} />
            </label>
            <label class="fld col-span-full">
              {t('street')}
              <input type="text" autocomplete="street-address" {...bind('line1')} />
            </label>
            <label class="fld">
              {t('city')}
              <input type="text" autocomplete="address-level2" {...bind('city')} />
            </label>
            <label class="fld">
              {t('zip')}
              <input type="text" inputmode="numeric" autocomplete="postal-code" {...bind('postalCode')} />
            </label>
            <label class="fld col-span-full">
              {t('notes')}
              <input type="text" placeholder={t('notesPlaceholder')} {...bind('notes')} />
            </label>
          </div>
        </section>

        <section class="card">
          <div class="card-h">
            <span class="stepn">3</span>
            <h2 class="hd">{tc('payment')}</h2>
          </div>
          <div class="choice" role="group" aria-label={tc('payment')}>
            {options.payment.map((method) => (
              <button class={method === payment ? 'mode on' : 'mode'} type="button" aria-pressed={method === payment} key={method} onClick={() => setPaymentChoice(method)}>
                <span class="radio" />
                <span>
                  <b>{t(PAYMENT[method].label)}</b>
                  {t(PAYMENT[method].sub)}
                </span>
              </button>
            ))}
          </div>
          {payment === 'card' && (
            // A demo store with no payment provider: these inputs are left uncontrolled and unnamed on purpose, so nothing typed in them is read, stored or sent.
            <div class="fgrid">
              <label class="fld col-span-full">
                {t('cardNumber')}
                <input type="text" inputmode="numeric" placeholder={t('cardDemo')} autocomplete="off" />
              </label>
              <label class="fld">
                {t('expiry')}
                <input type="text" placeholder={t('expiryPlaceholder')} autocomplete="off" />
              </label>
              <label class="fld">
                {t('cvcLabel')}
                <input type="text" placeholder={t('cvc')} autocomplete="off" />
              </label>
            </div>
          )}
          {payment === 'net_terms' && (
            <>
              <div class="note t">
                <Icon name="tag" />
                <span>{t('termsNote')}</span>
              </div>
              <label class="fld">
                {t('po')}
                <input type="text" {...bind('poNumber')} />
              </label>
            </>
          )}
        </section>
      </div>

      <aside class="sum" aria-label={tc('orderSummary')}>
        <h2 class="hd text-[22px]">{tc('orderSummary')}</h2>
        <div class="flex flex-col gap-2.5 border-b border-line pb-3">
          {cart.lines.map((line) => (
            <div class="mini" key={line.id}>
              <Img media={line.image} alt="" sizes="48px" />
              <span class="min-w-0 flex-1">
                {line.title}
                <br />
                <span class="fine">{[tc('qty', { qty: line.quantity }), line.variantTitle, line.unitLabel].filter(Boolean).join(' · ')}</span>
              </span>
              <b>{formatMoney(line.lineTotal, locale)}</b>
            </div>
          ))}
        </div>
        <TotalsRows locale={locale} totals={cart.totals} />
        {failed && (
          <div class="note" role="alert">
            {tc('genericError')}
          </div>
        )}
        <button class="btn full" type="button" disabled={placing} onClick={() => void placeOrder()}>
          {t('placeOrder')} {formatMoney(cart.totals.total, locale)}
        </button>
        <span class="fine text-center">{t('disclaimer')}</span>
      </aside>
    </div>
  );
}
