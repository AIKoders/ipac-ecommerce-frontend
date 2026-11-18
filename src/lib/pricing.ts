import type { PriceTier, Variant } from '@/lib/api/types';

/**
 * Price arithmetic shared by the product page (which shows a live price as the
 * quantity changes) and the mock backend. All amounts are integer minor units.
 * With the real API the cart's prices come from the server; this only predicts
 * them from the tiers the product carries.
 */

/** The tier that applies at `quantity`: the last one whose minimum is reached. */
export function tierFor(tiers: PriceTier[], quantity: number): { tier: PriceTier; index: number } {
  let index = 0;
  tiers.forEach((tier, i) => {
    if (quantity >= tier.minQuantity) index = i;
  });
  const tier = tiers[index];
  if (!tier) throw new Error('A variant needs at least one price tier.');
  return { tier, index };
}

/** Unit price at `quantity`, with the recurring discount applied when the line is on a schedule. */
export function unitAmount(variant: Pick<Variant, 'priceTiers'>, quantity: number, recurringDiscountPercent = 0): number {
  const base = tierFor(variant.priceTiers, quantity).tier.price.amount;
  return recurringDiscountPercent ? Math.round(base * (1 - recurringDiscountPercent / 100)) : base;
}

/** The standard volume ladder of the catalog: 5% off from 5 cases, 10% off from 10. */
export const VOLUME_LADDER = [
  { minQuantity: 1, factor: 1 },
  { minQuantity: 5, factor: 0.95 },
  { minQuantity: 10, factor: 0.9 },
] as const;

export const tiersFromBase = (amount: number, currency: string): PriceTier[] =>
  VOLUME_LADDER.map(({ minQuantity, factor }) => ({ minQuantity, price: { amount: Math.round(amount * factor), currency } }));
