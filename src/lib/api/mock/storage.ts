import type { Customer, FulfillmentMethod, FulfillmentStatus, OrderStatus, PaymentStatus, SubscriptionStatus } from '../types';

/**
 * The mock backend's database: one JSON document per browser, in
 * localStorage. While the site builds there is no browser, so state lives in
 * memory for the length of the build and only the catalog is read.
 */
export interface StoredLine {
  variantId: string;
  quantity: number;
  intervalWeeks: number | null;
}

export interface StoredOrder {
  id: string;
  number: string;
  placedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  method: FulfillmentMethod;
  fulfillmentStatus: FulfillmentStatus;
  estimatedDate: string | null;
  lines: StoredLine[];
  /** Totals are frozen at checkout; seeded history recomputes them from the catalog. */
  totals: { subtotal: number; shipping: number; tax: number; total: number } | null;
  email: string | null;
  guest: boolean;
}

export interface StoredSubscription {
  id: string;
  number: string;
  status: SubscriptionStatus;
  intervalWeeks: number;
  nextDeliveryAt: string;
  lines: StoredLine[];
}

export interface MockState {
  cartId: string;
  cart: StoredLine[];
  fulfillmentMethod: FulfillmentMethod;
  customer: Customer | null;
  /** The sample order history is added the first time someone signs in. */
  seeded: boolean;
  orders: StoredOrder[];
  subscriptions: StoredSubscription[];
  newsletter: string[];
}

const KEY = 'ipac.mock.v1';

const randomId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const initial = (): MockState => ({
  cartId: randomId('cart'),
  cart: [],
  fulfillmentMethod: 'local_delivery',
  customer: null,
  seeded: false,
  orders: [],
  subscriptions: [],
  newsletter: [],
});

let memory: MockState | null = null;

const browserStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function readState(): MockState {
  const storage = browserStorage();
  if (!storage) return (memory ??= initial());
  try {
    const raw = storage.getItem(KEY);
    if (raw) return { ...initial(), ...(JSON.parse(raw) as Partial<MockState>) };
  } catch {
    // Unreadable or blocked storage: start clean.
  }
  return initial();
}

export function writeState(state: MockState): void {
  const storage = browserStorage();
  if (!storage) {
    memory = state;
    return;
  }
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the session simply does not persist.
  }
}

/** Read, change, persist. Returns whatever the mutation returns. */
export function mutate<T>(change: (state: MockState) => T): T {
  const state = readState();
  const result = change(state);
  writeState(state);
  return result;
}

/** Forgets everything: a new visitor. Used by the tests. */
export function resetState(): void {
  memory = null;
  browserStorage()?.removeItem(KEY);
}

export { randomId };
