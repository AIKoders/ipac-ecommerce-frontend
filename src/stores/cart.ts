import { atom, computed } from 'nanostores';
import type { Locale } from '@/i18n';
import { getApi } from '@/lib/api';
import type { AddLineInput, Cart, CartLine, FulfillmentMethod } from '@/lib/api/types';
import { $panel } from './ui';

/**
 * The cart every island shares. It mirrors what the API returns: prices and
 * totals are never computed here. Quantity changes are applied optimistically
 * so a stepper responds at once, then replaced by the server's answer; when
 * several changes overlap, only the latest answer is kept.
 */
export const $cart = atom<Cart | null>(null);
export const $cartCount = computed($cart, (cart) => cart?.itemCount ?? 0);

/** Set while the cart popover is showing what was just added: it changes the title and closes on its own. */
export const $justAdded = atom(false);

const AUTO_CLOSE_MS = 4500;
let sequence = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

async function apply(locale: Locale, request: () => Promise<Cart>, optimistic?: (cart: Cart) => Cart): Promise<Cart | null> {
  const id = ++sequence;
  const before = $cart.get();
  if (optimistic && before) $cart.set(optimistic(before));
  try {
    const cart = await request();
    if (id === sequence) $cart.set(cart);
    return cart;
  } catch (error) {
    if (id === sequence) $cart.set(await getApi(locale).cart.get());
    throw error;
  }
}

export async function loadCart(locale: Locale): Promise<void> {
  const id = ++sequence;
  const cart = await getApi(locale).cart.get();
  if (id === sequence) $cart.set(cart);
}

export function openCart(justAdded = false): void {
  clearTimeout(closeTimer);
  $justAdded.set(justAdded);
  $panel.set('cart');
  if (justAdded) closeTimer = setTimeout(closeCart, AUTO_CLOSE_MS);
}

export function closeCart(): void {
  clearTimeout(closeTimer);
  if ($panel.get() === 'cart') $panel.set(null);
  $justAdded.set(false);
}

export function toggleCart(): void {
  if ($panel.get() === 'cart') closeCart();
  else openCart();
}

export async function addToCart(locale: Locale, lines: AddLineInput[], options: { announce?: boolean } = {}): Promise<void> {
  await apply(locale, () => getApi(locale).cart.addLines(lines));
  if (options.announce) openCart(true);
}

export function setQuantity(locale: Locale, lineId: string, quantity: number): Promise<Cart | null> {
  $justAdded.set(false);
  const next = Math.max(0, quantity);
  return apply(
    locale,
    () => getApi(locale).cart.setQuantity(lineId, next),
    (cart) => {
      const lines = cart.lines.map((line) => (line.id === lineId ? { ...line, quantity: next } : line)).filter((line) => line.quantity > 0);
      return { ...cart, lines, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0) };
    },
  );
}

export const setFulfillment = (locale: Locale, method: FulfillmentMethod): Promise<Cart | null> =>
  apply(
    locale,
    () => getApi(locale).cart.setFulfillment(method),
    (cart) => ({ ...cart, fulfillmentMethod: method }),
  );

/** The one-time line of a variant, which is what a product card's stepper controls. */
export const oneTimeLine = (cart: Cart | null, variantId: string): CartLine | undefined =>
  cart?.lines.find((line) => line.variantId === variantId && line.intervalWeeks === null);
