import type { Order, Subscription, SubscriptionStatus } from '@/lib/api/types';

/** The dashboard's sections, by the name they have in `?tab=`. */
export const TABS = ['overview', 'orders', 'recurring', 'billing', 'details'] as const;
export type Tab = (typeof TABS)[number];

export const isTab = (value: unknown): value is Tab => (TABS as readonly unknown[]).includes(value);

/**
 * What a section can ask the account page to do. The page owns the data: each
 * action calls the API and refreshes whatever it changed.
 */
export interface AccountActions {
  /** Switches section from inside the content; focus follows to the new section. */
  open(tab: Tab): void;
  reorder(order: Order): void;
  makeRecurring(order: Order): void;
  skipNext(subscription: Subscription): void;
  setIntervalWeeks(subscription: Subscription, weeks: number): void;
  setStatus(subscription: Subscription, status: SubscriptionStatus): void;
  cancel(subscription: Subscription): void;
}
