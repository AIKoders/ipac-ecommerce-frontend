import { beforeEach, describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { createMockApi } from '@/lib/api/mock';
import { resetState } from '@/lib/api/mock/storage';

const api = createMockApi('en');
const variantOf = async (handle: string) => (await api.catalog.getProduct(handle)).variants[0]!.id;

beforeEach(() => resetState());

describe('catalog', () => {
  test('lists every product and filters by aisle, price and search', async () => {
    const all = await api.catalog.listProducts();
    expect(all.totalCount).toBe(18);
    const tape = await api.catalog.listProducts({ category: 'tape-labels' });
    expect(tape.items.map((item) => item.handle)).toEqual(['packing-tape', 'heavy-duty-tape-dispenser', 'direct-thermal-shipping-labels']);
    const cheap = await api.catalog.listProducts({ priceMax: 3999, sort: 'price_asc' });
    expect(cheap.items.every((item) => item.price.amount < 4000)).toBe(true);
    expect(cheap.items[0]?.handle).toBe('heavy-duty-tape-dispenser');
    expect((await api.catalog.listProducts({ q: 'guantes' })).items.map((item) => item.handle)).toEqual(['nitrile-gloves']);
  });

  test('text comes in the requested locale', async () => {
    expect((await api.catalog.getProduct('packing-tape')).title).toBe('Packing Tape, 2 in × 110 yd');
    expect((await createMockApi('es').catalog.getProduct('packing-tape')).title).toContain('Cinta');
  });

  test('an unknown product is a not_found ApiError', async () => {
    const error = await api.catalog.getProduct('nope').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('not_found');
  });
});

describe('cart', () => {
  test('adding the same variant merges lines; a recurring line stays separate', async () => {
    const tape = await variantOf('packing-tape');
    await api.cart.addLines([{ variantId: tape, quantity: 1 }]);
    await api.cart.addLines([{ variantId: tape, quantity: 2 }]);
    const cart = await api.cart.addLines([{ variantId: tape, quantity: 1, intervalWeeks: 4 }]);
    expect(cart.lines.map((line) => [line.quantity, line.intervalWeeks])).toEqual([
      [3, null],
      [1, 4],
    ]);
    expect(cart.itemCount).toBe(4);
    expect(cart.hasRecurring).toBe(true);
  });

  test('prices follow the volume tiers and the recurring discount', async () => {
    const tape = await variantOf('packing-tape');
    const once = await api.cart.addLines([{ variantId: tape, quantity: 5 }]);
    expect(once.lines[0]?.unitPrice.amount).toBe(5890);
    const recurring = await api.cart.addLines([{ variantId: tape, quantity: 1, intervalWeeks: 2 }]);
    expect(recurring.lines[1]?.unitPrice.amount).toBe(5890);
  });

  test('local delivery is free from $150, tax is 6.5% of the subtotal', async () => {
    const box = await variantOf('corrugated-shipping-boxes');
    const small = await api.cart.addLines([{ variantId: box, quantity: 1 }]);
    expect(small.totals).toMatchObject({ subtotal: { amount: 2875 }, shipping: { amount: 1200 }, tax: { amount: 187 }, total: { amount: 4262 } });
    expect(small.freeDelivery.remaining.amount).toBe(12125);
    const large = await api.cart.setQuantity(small.lines[0]!.id, 6);
    expect(large.totals.subtotal.amount).toBe(16386);
    expect(large.totals.shipping.amount).toBe(0);
    expect(large.freeDelivery.progress).toBe(1);
    expect((await api.cart.setFulfillment('shipping')).totals.shipping.amount).toBe(1800);
  });

  test('a quantity of zero removes the line', async () => {
    const cart = await api.cart.addLines([{ variantId: await variantOf('packing-tape'), quantity: 1 }]);
    expect((await api.cart.setQuantity(cart.lines[0]!.id, 0)).lines).toHaveLength(0);
  });
});

describe('checkout and account', () => {
  const order = (email?: string) => api.checkout.placeOrder({ email, fulfillmentMethod: 'local_delivery', shipTo: {}, payment: { method: 'card' }, idempotencyKey: 'test' });

  test('a guest needs an email', async () => {
    await api.cart.addLines([{ variantId: await variantOf('packing-tape'), quantity: 1 }]);
    const error = await order().catch((cause: unknown) => cause);
    expect((error as ApiError).code).toBe('invalid');
    expect((error as ApiError).errors[0]?.field).toBe('email');
  });

  test('placing an order empties the cart and turns recurring lines into a subscription', async () => {
    await api.cart.addLines([
      { variantId: await variantOf('packing-tape'), quantity: 1 },
      { variantId: await variantOf('paper-hot-cups-with-lids'), quantity: 2, intervalWeeks: 4 },
    ]);
    const placed = await order('owner@example.com');
    expect(placed.number).toMatch(/^IP-\d+$/);
    expect(placed.guest).toBe(true);
    expect(placed.hasRecurring).toBe(true);
    expect((await api.cart.get()).lines).toHaveLength(0);
    // The guest's email became an account so the schedule can be managed.
    expect((await api.auth.getSession())?.customer.email).toBe('owner@example.com');
    const subscriptions = await api.account.listSubscriptions();
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({ intervalWeeks: 4, status: 'active' });
    expect((await api.account.getOrder(placed.number)).totals.total.amount).toBe(placed.totals.total.amount);
  });

  test('the account is private until someone signs in', async () => {
    const error = await api.account.getOverview().catch((cause: unknown) => cause);
    expect((error as ApiError).code).toBe('unauthenticated');
  });

  test('signing in needs six digits and brings the sample history', async () => {
    const error = await api.auth.verifyCode('alex@samplecafe.com', '12').catch((cause: unknown) => cause);
    expect((error as ApiError).code).toBe('invalid');
    const session = await api.auth.verifyCode('alex@samplecafe.com', '123456');
    expect(session.customer.firstName).toBe('Alex');
    const overview = await api.account.getOverview();
    expect(overview.stats.orderCount).toBe(4);
    expect(overview.next?.kind).toBe('order');
    expect(overview.restock.length).toBeGreaterThan(0);
    expect(await api.account.listInvoices()).toHaveLength(4);
  });

  test('a subscription can be rescheduled, skipped, paused and cancelled', async () => {
    await api.auth.verifyCode('alex@samplecafe.com', '123456');
    const [subscription] = await api.account.listSubscriptions();
    const id = subscription!.id;
    expect((await api.account.updateSubscription(id, { intervalWeeks: 8 })).intervalWeeks).toBe(8);
    const before = Date.parse(subscription!.nextDeliveryAt!);
    const skipped = await api.account.skipNextDelivery(id);
    expect(Date.parse(skipped.nextDeliveryAt!) - before).toBe(8 * 7 * 86_400_000);
    expect((await api.account.updateSubscription(id, { status: 'paused' })).nextDeliveryAt).toBeNull();
    await api.account.cancelSubscription(id);
    expect(await api.account.listSubscriptions()).toHaveLength(0);
  });

  test('reordering puts a past order back in the cart', async () => {
    await api.auth.verifyCode('alex@samplecafe.com', '123456');
    const [latest] = await api.account.listOrders();
    const cart = await api.account.reorder(latest!.id);
    expect(cart.itemCount).toBe(latest!.itemCount);
  });
});
