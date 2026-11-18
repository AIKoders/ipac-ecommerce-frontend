import { useStore } from '@nanostores/preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { cart as cartMessages } from '@/i18n/ns/cart';
import { common } from '@/i18n/ns/common';
import { header } from '@/i18n/ns/header';
import { formatMoney } from '@/lib/format';
import { boot } from '@/stores/boot';
import { $cart, $justAdded, closeCart, setQuantity, toggleCart } from '@/stores/cart';
import { $session, signOut } from '@/stores/session';
import { $panel, closePanels, togglePanel } from '@/stores/ui';
import { Img, Stepper, intervalLabel } from './shared';

/**
 * The right side of the header: account, orders, cart and the menu button,
 * with the account and cart popovers. Rendered on the server in its guest,
 * empty-cart state and brought up to date once the cart and session load.
 */
export function HeaderActions({ locale }: { locale: Locale }) {
  const t = translator(header, locale);
  const tc = translator(common, locale);
  const tk = translator(cartMessages, locale);
  const to = (path: string) => localizePath(locale, path);

  const cart = useStore($cart);
  const session = useStore($session);
  const panel = useStore($panel);
  const justAdded = useStore($justAdded);
  const cartButton = useRef<HTMLButtonElement>(null);

  useEffect(() => boot(locale), [locale]);

  const count = cart?.itemCount ?? 0;
  const customer = session?.customer;
  const zero = { amount: 0, currency: 'USD' };

  return (
    <>
      {customer ? (
        <button class="nbtn" type="button" aria-label={tc('account')} aria-expanded={panel === 'account'} aria-controls="account-menu" onClick={() => togglePanel('account')}>
          <span class="nic">
            <Icon name="user" />
          </span>
          <span class="two">
            <small>{customer.firstName ? t('helloName', { name: customer.firstName }) : t('signedIn')}</small>
            {tc('account')}
          </span>
        </button>
      ) : (
        <a class="nbtn" href={to('/account/sign-in')} aria-label={tc('account')}>
          <span class="nic">
            <Icon name="user" />
          </span>
          <span class="two">
            <small>{t('helloSignIn')}</small>
            {t('accountOrders')}
          </span>
        </a>
      )}

      <a class="nbtn nord" href={`${to('/account')}?tab=orders`} aria-label={t('ordersAria')}>
        <span class="nic">
          <Icon name="repeat" />
        </span>
        <span class="two">
          <small>{t('ordersSmall')}</small>
          {t('ordersBig')}
        </span>
      </a>

      <button ref={cartButton} class="nbtn cartbtn" type="button" aria-label={`${t('openCart')} (${count})`} aria-expanded={panel === 'cart'} aria-controls="cart-popover" onClick={toggleCart}>
        <span class="nic">
          <Icon name="cart" />
          <b class={`badge bump${count % 2}${count ? ' has' : ''}`}>{count}</b>
        </span>
        <span class="two carttxt">
          <small>{tc('cart')}</small>
          {formatMoney(cart?.totals.subtotal ?? zero, locale)}
        </span>
      </button>

      <button class="nbtn burger" type="button" aria-label={t('menu')} aria-expanded={panel === 'mobile'} aria-controls="mobile-menu" onClick={() => togglePanel('mobile')}>
        <Icon name={panel === 'mobile' ? 'x' : 'menu'} />
      </button>

      {panel === 'account' && customer && (
        <div class="pop acctpop" id="account-menu">
          <a class="mi" href={to('/account')}>
            <Icon name="grid" />
            {t('overview')}
          </a>
          <a class="mi" href={`${to('/account')}?tab=orders`}>
            <Icon name="box" />
            {tc('orders')}
          </a>
          <a class="mi" href={`${to('/account')}?tab=recurring`}>
            <Icon name="repeat" />
            {tc('recurringOrders')}
          </a>
          <button
            class="mi"
            type="button"
            onClick={async () => {
              await signOut(locale);
              closePanels();
              window.location.assign(to('/'));
            }}
          >
            <Icon name="x" />
            {tc('signOut')}
          </button>
        </div>
      )}

      {panel === 'cart' && (
        <div class="pop cartpop" id="cart-popover" role="dialog" aria-label={tc('cart')}>
          <div class="sp">
            <b class="hd inline-flex items-center gap-2 text-[20px]" aria-live="polite">
              {justAdded ? tk('added') : tk('title')}
            </b>
            <button
              class="xbtn"
              type="button"
              aria-label={tk('close')}
              onClick={() => {
                closeCart();
                cartButton.current?.focus();
              }}
            >
              <Icon name="x" />
            </button>
          </div>

          {!cart || cart.lines.length === 0 ? (
            <>
              <p class="mut">{tk('popEmpty')}</p>
              <a class="btn full" href={to('/shop')}>
                {tk('startShopping')}
              </a>
            </>
          ) : (
            <>
              <div class="flex flex-col gap-1.5">
                <span class="fine inline-flex items-center gap-2">
                  <Icon name="truck" />
                  {cart.freeDelivery.remaining.amount > 0 ? tk('freeRemaining', { amount: formatMoney(cart.freeDelivery.remaining, locale) }) : tk('freeUnlocked')}
                </span>
                <div class="prog">
                  <i style={{ width: `${cart.freeDelivery.progress * 100}%` }} />
                </div>
              </div>
              <div>
                {cart.lines.map((line) => (
                  <div class="cp-line" key={line.id}>
                    <Img media={line.image} alt="" sizes="64px" />
                    <div class="flex min-w-0 flex-col gap-1.5">
                      <b>{line.title}</b>
                      <span class="fine">{[line.variantTitle, line.unitLabel].filter(Boolean).join(' · ')}</span>
                      {line.intervalWeeks && (
                        <span class="pillx g self-start">
                          <Icon name="repeat" />
                          {tc('recurringLine', { interval: intervalLabel(locale, line.intervalWeeks) })}
                        </span>
                      )}
                      <div class="sp">
                        <Stepper locale={locale} quantity={line.quantity} onChange={(quantity) => void setQuantity(locale, line.id, quantity)} />
                        <b class="text-[16px]">{formatMoney(line.lineTotal, locale)}</b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div class="sp text-[17px]">
                <span>
                  {tk('subtotalDot')} {cart.itemCount} {tc(cart.itemCount === 1 ? 'item' : 'items')}
                </span>
                <b class="hd text-[22px]">{formatMoney(cart.totals.subtotal, locale)}</b>
              </div>
              <a class="btn full" href={to('/checkout')}>
                {tc('checkout')}
                <Icon name="arrowRight" />
              </a>
              <a class="btn o full" href={to('/cart')}>
                {tk('view')}
              </a>
              <p class="fine text-center">{tk('guestNote')}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
