import { describe, expect, test } from 'bun:test';
import { tierFor, tiersFromBase, unitAmount } from '@/lib/pricing';

const tiers = tiersFromBase(2875, 'USD');

describe('volume pricing', () => {
  test('the ladder drops 5% at 5 cases and 10% at 10', () => {
    expect(tiers.map((tier) => [tier.minQuantity, tier.price.amount])).toEqual([
      [1, 2875],
      [5, 2731],
      [10, 2588],
    ]);
  });

  test('a quantity uses the last tier it reaches', () => {
    expect(tierFor(tiers, 1).index).toBe(0);
    expect(tierFor(tiers, 4).index).toBe(0);
    expect(tierFor(tiers, 5).index).toBe(1);
    expect(tierFor(tiers, 9).index).toBe(1);
    expect(tierFor(tiers, 10).index).toBe(2);
    expect(tierFor(tiers, 250).index).toBe(2);
  });

  test('the recurring discount applies on top of the tier, in whole cents', () => {
    expect(unitAmount({ priceTiers: tiers }, 1)).toBe(2875);
    expect(unitAmount({ priceTiers: tiers }, 1, 5)).toBe(2731);
    expect(unitAmount({ priceTiers: tiers }, 10, 5)).toBe(2459);
  });
});
