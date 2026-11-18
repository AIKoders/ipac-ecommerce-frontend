import type { Locale } from '@/i18n';
import { addDays, nextBusinessDay } from '@/lib/format';
import { unitAmount } from '@/lib/pricing';
import type { StorefrontApi } from '../contracts';
import { ApiError } from '../errors';
import type {
  AccountOverview,
  AddLineInput,
  Cart,
  CartLine,
  Customer,
  FulfillmentMethod,
  FulfillmentStatus,
  Invoice,
  NextDelivery,
  Order,
  OrderLine,
  RestockSuggestion,
  ShippingOption,
  Subscription,
  Totals,
} from '../types';
import { CURRENCY, createCatalog, store } from './catalog';
import { LATENCY, wait } from './latency';
import { mutate, randomId, readState, type MockState, type StoredLine, type StoredOrder, type StoredSubscription } from './storage';

/**
 * A backend in the browser: the catalog comes from fixtures, and carts,
 * sessions, orders and subscriptions are kept in localStorage. It implements
 * the same `StorefrontApi` the HTTP adapter does, including the business rules
 * a real backend owns (volume pricing, the recurring discount, shipping, tax),
 * so the UI never computes a total on its own.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86_400_000;
/** How long a case is assumed to last, for the restock estimate. */
const SUPPLY_DAYS = 35;

const SAMPLE_CUSTOMER: Customer = { id: 'cus_01sample0cafe0bakery0alex00', firstName: 'Alex', company: 'Sample Café & Bakery', email: 'alex@samplecafe.com' };

const money = (amount: number) => ({ amount, currency: CURRENCY });
const lineKey = (line: Pick<StoredLine, 'variantId' | 'intervalWeeks'>) => `${line.variantId}:${line.intervalWeeks ?? 'once'}`;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

export function createMockApi(locale: Locale): StorefrontApi {
  const catalog = createCatalog(locale);

  // ---------------------------------------------------------------- pricing

  function priceLine(line: StoredLine): OrderLine | null {
    const found = catalog.findVariant(line.variantId);
    if (!found) return null;
    const unit = unitAmount(found.variant, line.quantity, line.intervalWeeks ? store.recurring.discountPercent : 0);
    return {
      productId: found.summary.id,
      variantId: line.variantId,
      handle: found.summary.handle,
      title: found.summary.title,
      variantTitle: found.variant.title,
      image: found.summary.image,
      quantity: line.quantity,
      unitPrice: money(unit),
      lineTotal: money(unit * line.quantity),
      intervalWeeks: line.intervalWeeks,
    };
  }

  const priceLines = (lines: StoredLine[]): OrderLine[] => lines.map(priceLine).filter((line): line is OrderLine => line !== null);

  function shippingAmount(method: FulfillmentMethod, subtotal: number, hasItems: boolean): number {
    if (!hasItems) return 0;
    if (method === 'local_delivery') return subtotal >= store.freeDeliveryThreshold ? 0 : store.shippingRates.local_delivery;
    return store.shippingRates[method];
  }

  function totalsFor(lines: OrderLine[], method: FulfillmentMethod): { totals: Totals; raw: NonNullable<StoredOrder['totals']> } {
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal.amount, 0);
    const shipping = shippingAmount(method, subtotal, lines.length > 0);
    const tax = Math.round(subtotal * store.taxRate);
    const raw = { subtotal, shipping, tax, total: subtotal + shipping + tax };
    return { raw, totals: { subtotal: money(subtotal), shipping: money(shipping), tax: money(tax), total: money(raw.total) } };
  }

  // ------------------------------------------------------------------- cart

  function toCart(state: MockState): Cart {
    const priced = priceLines(state.cart);
    const { totals, raw } = totalsFor(priced, state.fulfillmentMethod);
    const lines: CartLine[] = priced.map((line) => ({
      ...line,
      id: lineKey(line),
      unitLabel: catalog.findVariant(line.variantId)?.summary.unitLabel ?? '',
    }));
    const threshold = store.freeDeliveryThreshold;
    return {
      id: state.cartId,
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      fulfillmentMethod: state.fulfillmentMethod,
      totals,
      freeDelivery: { threshold: money(threshold), remaining: money(Math.max(0, threshold - raw.subtotal)), progress: Math.min(1, raw.subtotal / threshold) },
      hasRecurring: lines.some((line) => line.intervalWeeks !== null),
    };
  }

  function addToState(state: MockState, lines: AddLineInput[]): void {
    for (const input of lines) {
      if (!catalog.findVariant(input.variantId)) throw ApiError.notFound(`Variant "${input.variantId}"`);
      const quantity = Math.max(1, Math.floor(input.quantity));
      const incoming: StoredLine = { variantId: input.variantId, quantity, intervalWeeks: input.intervalWeeks ?? null };
      const existing = state.cart.find((line) => lineKey(line) === lineKey(incoming));
      if (existing) existing.quantity += quantity;
      else state.cart.push(incoming);
    }
  }

  // ----------------------------------------------------------------- orders

  function toOrder(stored: StoredOrder): Order {
    const lines = priceLines(stored.lines);
    const totals = stored.totals
      ? { subtotal: money(stored.totals.subtotal), shipping: money(stored.totals.shipping), tax: money(stored.totals.tax), total: money(stored.totals.total) }
      : totalsFor(lines, 'pickup').totals;
    return {
      id: stored.id,
      number: stored.number,
      placedAt: stored.placedAt,
      status: stored.status,
      paymentStatus: stored.paymentStatus,
      fulfillment: { method: stored.method, status: stored.fulfillmentStatus, estimatedDate: stored.estimatedDate },
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      totals,
      email: stored.email,
      hasRecurring: stored.lines.some((line) => line.intervalWeeks !== null),
      guest: stored.guest,
    };
  }

  function toSubscription(stored: StoredSubscription): Subscription {
    const lines = priceLines(stored.lines);
    return {
      id: stored.id,
      number: stored.number,
      status: stored.status,
      intervalWeeks: stored.intervalWeeks,
      nextDeliveryAt: stored.status === 'active' ? stored.nextDeliveryAt : null,
      lines,
      perDelivery: money(lines.reduce((sum, line) => sum + line.lineTotal.amount, 0)),
    };
  }

  /** The order history and schedule of the sample café, relative to today. */
  function seed(state: MockState): void {
    if (state.seeded) return;
    const once = (key: string, quantity: number): StoredLine => ({ variantId: catalog.variantIdOf(key), quantity, intervalWeeks: null });
    const order = (number: string, daysAgo: number, lines: StoredLine[], fulfillmentStatus: FulfillmentStatus): StoredOrder => ({
      id: randomId('ord'),
      number,
      placedAt: daysFromNow(-daysAgo),
      status: fulfillmentStatus === 'delivered' ? 'completed' : 'open',
      paymentStatus: fulfillmentStatus === 'delivered' ? 'paid' : 'pending',
      method: 'local_delivery',
      fulfillmentStatus,
      estimatedDate: fulfillmentStatus === 'delivered' ? null : new Date().toISOString(),
      lines,
      totals: null,
      email: SAMPLE_CUSTOMER.email,
      guest: false,
    });
    state.orders.push(
      order('IP-48263', 1, [once('clamshell', 2), once('cups', 1), once('paper-bags', 1)], 'out_for_delivery'),
      order('IP-48127', 14, [once('cups', 2), once('takeout', 1), once('paper-bags', 1)], 'delivered'),
      order('IP-47902', 28, [once('box', 4), once('tape', 1), once('bubble-wrap', 2)], 'delivered'),
      order('IP-47655', 42, [once('gloves', 1), once('liners', 2), once('towels', 2)], 'delivered'),
    );
    state.subscriptions.push({
      id: randomId('sub'),
      number: 'R-641',
      status: 'active',
      intervalWeeks: 4,
      nextDeliveryAt: daysFromNow(9),
      lines: [
        { variantId: catalog.variantIdOf('cups'), quantity: 2, intervalWeeks: 4 },
        { variantId: catalog.variantIdOf('deli'), quantity: 1, intervalWeeks: 4 },
      ],
    });
    state.seeded = true;
  }

  function requireCustomer(state: MockState): Customer {
    if (!state.customer) throw ApiError.unauthenticated();
    return state.customer;
  }

  function findOrder(state: MockState, idOrNumber: string): StoredOrder {
    const order = state.orders.find((candidate) => candidate.id === idOrNumber || candidate.number === idOrNumber);
    if (!order) throw ApiError.notFound(`Order "${idOrNumber}"`);
    return order;
  }

  function findSubscription(state: MockState, id: string): StoredSubscription {
    const subscription = state.subscriptions.find((candidate) => candidate.id === id);
    if (!subscription) throw ApiError.notFound(`Subscription "${id}"`);
    return subscription;
  }

  function restockSuggestions(state: MockState): RestockSuggestion[] {
    const seen = new Set<string>();
    for (const subscription of state.subscriptions) {
      if (subscription.status === 'active') for (const line of subscription.lines) seen.add(line.variantId);
    }
    const suggestions: RestockSuggestion[] = [];
    for (const order of state.orders) {
      for (const line of order.lines) {
        if (seen.has(line.variantId)) continue;
        seen.add(line.variantId);
        const found = catalog.findVariant(line.variantId);
        if (!found) continue;
        const since = Math.max(0, Math.round((Date.now() - Date.parse(order.placedAt)) / DAY));
        const daysLeft = Math.max(0, SUPPLY_DAYS - since);
        suggestions.push({
          product: found.summary,
          daysLeft,
          percentLeft: Math.max(6, Math.round((daysLeft / SUPPLY_DAYS) * 100)),
          due: daysLeft <= 5,
          lastOrderedAt: order.placedAt,
        });
      }
    }
    return suggestions.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }

  const orderTotal = (order: StoredOrder): number => toOrder(order).totals.total.amount;

  // -------------------------------------------------------------------- API

  return {
    store: {
      getSettings: async () => catalog.settings(),
    },

    catalog: {
      listCategories: async () => catalog.categories(),
      getCategory: async (handle) => catalog.category(handle),
      async listProducts(query) {
        await wait(LATENCY.read);
        return catalog.listProducts(query);
      },
      getProduct: async (handle) => catalog.product(handle),
    },

    content: {
      listPosts: async () => catalog.posts(),
      getPost: async (slug) => catalog.post(slug),
      listFaqs: async () => catalog.faqs(),
    },

    cart: {
      async get() {
        return toCart(readState());
      },
      async addLines(lines) {
        await wait(LATENCY.write);
        return mutate((state) => {
          addToState(state, lines);
          return toCart(state);
        });
      },
      async setQuantity(lineId, quantity) {
        await wait(LATENCY.write);
        return mutate((state) => {
          const line = state.cart.find((candidate) => lineKey(candidate) === lineId);
          if (!line) throw ApiError.notFound('Cart line');
          line.quantity = Math.max(0, Math.floor(quantity));
          state.cart = state.cart.filter((candidate) => candidate.quantity > 0);
          return toCart(state);
        });
      },
      async setFulfillment(method) {
        await wait(LATENCY.write);
        return mutate((state) => {
          state.fulfillmentMethod = method;
          return toCart(state);
        });
      },
    },

    checkout: {
      async getOptions() {
        const state = readState();
        const subtotal = priceLines(state.cart).reduce((sum, line) => sum + line.lineTotal.amount, 0);
        const hasItems = state.cart.length > 0;
        const option = (method: FulfillmentMethod, estimatedDate: string | null): ShippingOption => ({ method, amount: money(shippingAmount(method, subtotal, hasItems)), estimatedDate });
        return {
          shipping: [option('local_delivery', nextBusinessDay().toISOString()), option('pickup', null), option('shipping', null)],
          payment: ['card', 'net_terms'],
        };
      },

      async placeOrder(input) {
        await wait(LATENCY.order);
        return mutate((state) => {
          if (!state.cart.length) throw new ApiError({ code: 'conflict', status: 409, message: 'The cart is empty.' });
          const email = state.customer?.email ?? input.email?.trim() ?? '';
          if (!EMAIL.test(email)) throw ApiError.invalid([{ field: 'email', code: 'email', message: 'Enter a valid email address.' }]);

          state.fulfillmentMethod = input.fulfillmentMethod;
          const lines = state.cart.map((line) => ({ ...line }));
          const { raw } = totalsFor(priceLines(lines), input.fulfillmentMethod);
          const guest = !state.customer;
          const stored: StoredOrder = {
            id: randomId('ord'),
            number: `IP-${48_300 + state.orders.length * 37 + Math.floor(Math.random() * 30)}`,
            placedAt: new Date().toISOString(),
            status: 'open',
            paymentStatus: input.payment.method === 'net_terms' ? 'on_terms' : 'pending',
            method: input.fulfillmentMethod,
            fulfillmentStatus: 'in_progress',
            estimatedDate: input.fulfillmentMethod === 'shipping' ? addDays(new Date(), 5).toISOString() : nextBusinessDay().toISOString(),
            lines,
            totals: raw,
            email,
            guest,
          };
          state.orders.unshift(stored);

          const bySchedule = new Map<number, StoredLine[]>();
          for (const line of lines) {
            if (line.intervalWeeks) bySchedule.set(line.intervalWeeks, [...(bySchedule.get(line.intervalWeeks) ?? []), line]);
          }
          for (const [intervalWeeks, scheduled] of bySchedule) {
            state.subscriptions.unshift({
              id: randomId('sub'),
              number: `R-${702 + state.subscriptions.length}`,
              status: 'active',
              intervalWeeks,
              nextDeliveryAt: daysFromNow(intervalWeeks * 7),
              lines: scheduled,
            });
          }
          // A recurring delivery needs somewhere to be managed from: the guest's email becomes an account.
          if (guest && bySchedule.size > 0) state.customer = { id: randomId('cus'), firstName: '', company: input.shipTo.company?.trim() ?? '', email };

          state.cart = [];
          return toOrder(stored);
        });
      },
    },

    auth: {
      async getSession() {
        const { customer } = readState();
        return customer ? { customer } : null;
      },
      async requestCode(email) {
        await wait(LATENCY.form);
        if (!EMAIL.test(email.trim())) throw ApiError.invalid([{ field: 'email', code: 'email', message: 'Enter a valid email address.' }]);
      },
      async verifyCode(_email, code) {
        await wait(LATENCY.auth);
        if (!/^\d{6}$/.test(code.trim())) throw ApiError.invalid([{ field: 'code', code: 'format', message: 'Enter the 6 digits from the email.' }]);
        return mutate((state) => {
          // Guest orders placed in this browser join the account, as a real sign-in would merge them.
          for (const order of state.orders) order.guest = false;
          seed(state);
          state.customer = SAMPLE_CUSTOMER;
          return { customer: SAMPLE_CUSTOMER };
        });
      },
      async signOut() {
        mutate((state) => {
          state.customer = null;
        });
      },
    },

    account: {
      async getOverview(): Promise<AccountOverview> {
        await wait(LATENCY.read);
        const state = readState();
        requireCustomer(state);
        const open = state.orders.find((order) => order.status === 'open');
        const nextSubscription = state.subscriptions.filter((subscription) => subscription.status === 'active').sort((a, b) => Date.parse(a.nextDeliveryAt) - Date.parse(b.nextDeliveryAt))[0];
        const next: NextDelivery | null = open
          ? { kind: 'order', order: toOrder(open) }
          : nextSubscription
            ? { kind: 'subscription', subscription: toSubscription(nextSubscription) }
            : null;
        const last = state.orders.find((order) => order.fulfillmentStatus === 'delivered') ?? state.orders[0];
        return {
          stats: {
            orderCount: state.orders.length,
            totalSpent: money(state.orders.reduce((sum, order) => sum + orderTotal(order), 0)),
            activeSubscriptions: state.subscriptions.filter((subscription) => subscription.status === 'active').length,
          },
          next,
          lastOrder: last ? toOrder(last) : null,
          restock: restockSuggestions(state),
          buyAgain: ['cups', 'takeout', 'box', 'tape', 'gloves', 'paper-bags'].map((key) => catalog.summaryByKey(key)),
        };
      },

      async listOrders(filter) {
        await wait(LATENCY.read);
        const state = readState();
        requireCustomer(state);
        return state.orders.filter((order) => !filter?.status || order.status === filter.status).map(toOrder);
      },

      async getOrder(number) {
        await wait(LATENCY.read);
        // Guests can open the order they just placed; the number is the capability, as in an emailed receipt link.
        return toOrder(findOrder(readState(), number));
      },

      async reorder(orderId) {
        await wait(LATENCY.write);
        return mutate((state) => {
          const order = findOrder(state, orderId);
          addToState(state, order.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, intervalWeeks: null })));
          return toCart(state);
        });
      },

      async listSubscriptions() {
        await wait(LATENCY.read);
        const state = readState();
        requireCustomer(state);
        return state.subscriptions.map(toSubscription);
      },

      async createSubscriptionFromOrder(orderId) {
        await wait(LATENCY.write);
        return mutate((state) => {
          requireCustomer(state);
          const order = findOrder(state, orderId);
          const intervalWeeks = store.recurring.defaultIntervalWeeks;
          const subscription: StoredSubscription = {
            id: randomId('sub'),
            number: `R-${720 + state.subscriptions.length}`,
            status: 'active',
            intervalWeeks,
            nextDeliveryAt: daysFromNow(intervalWeeks * 7),
            lines: order.lines.map((line) => ({ ...line, intervalWeeks })),
          };
          state.subscriptions.unshift(subscription);
          return toSubscription(subscription);
        });
      },

      async updateSubscription(id, patch) {
        await wait(LATENCY.write);
        return mutate((state) => {
          requireCustomer(state);
          const subscription = findSubscription(state, id);
          if (patch.intervalWeeks) {
            subscription.intervalWeeks = patch.intervalWeeks;
            subscription.lines = subscription.lines.map((line) => ({ ...line, intervalWeeks: patch.intervalWeeks ?? line.intervalWeeks }));
          }
          if (patch.status) subscription.status = patch.status;
          return toSubscription(subscription);
        });
      },

      async skipNextDelivery(id) {
        await wait(LATENCY.write);
        return mutate((state) => {
          requireCustomer(state);
          const subscription = findSubscription(state, id);
          subscription.nextDeliveryAt = new Date(Date.parse(subscription.nextDeliveryAt) + subscription.intervalWeeks * 7 * DAY).toISOString();
          return toSubscription(subscription);
        });
      },

      async cancelSubscription(id) {
        await wait(LATENCY.write);
        mutate((state) => {
          requireCustomer(state);
          state.subscriptions = state.subscriptions.filter((subscription) => subscription.id !== id);
        });
      },

      async listInvoices(): Promise<Invoice[]> {
        await wait(LATENCY.read);
        const state = readState();
        requireCustomer(state);
        return state.orders.map((order) => ({
          id: `inv_${order.id}`,
          number: `INV-${order.number.replace('IP-', '')}`,
          orderNumber: order.number,
          issuedAt: order.placedAt,
          total: money(orderTotal(order)),
          status: order.fulfillmentStatus === 'delivered' ? 'paid' : 'due_on_delivery',
        }));
      },

      async getBilling() {
        await wait(LATENCY.read);
        requireCustomer(readState());
        return {
          card: { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 },
          netTermsAvailable: true,
          addresses: [{ id: 'adr_01sample0main0location000000', label: locale === 'es' ? 'Sede principal' : 'Main location', isDefault: true, address: null, note: locale === 'es' ? 'Puerta trasera · entregas de 8am a 2pm' : 'Back door · deliveries 8am to 2pm' }],
        };
      },
    },

    forms: {
      async submitContact(input) {
        await wait(LATENCY.form);
        const errors = [];
        if (!input.name.trim()) errors.push({ field: 'name', code: 'required', message: 'This field is required.' });
        if (!EMAIL.test(input.email.trim())) errors.push({ field: 'email', code: 'email', message: 'Enter a valid email address.' });
        if (!input.message.trim()) errors.push({ field: 'message', code: 'required', message: 'This field is required.' });
        if (errors.length) throw ApiError.invalid(errors);
      },
      async subscribeNewsletter(email) {
        await wait(LATENCY.form);
        if (!EMAIL.test(email.trim())) throw ApiError.invalid([{ field: 'email', code: 'email', message: 'Enter a valid email address.' }]);
        mutate((state) => {
          if (!state.newsletter.includes(email.trim())) state.newsletter.push(email.trim());
        });
      },
    },
  };
}
