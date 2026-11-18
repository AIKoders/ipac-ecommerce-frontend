import { atom } from 'nanostores';
import type { Product, RecurringPolicy, Variant } from '@/lib/api/types';
import { tierFor, unitAmount } from '@/lib/pricing';

/**
 * What the shopper has picked on a product page: variant, quantity and
 * whether it is a one-time purchase or a recurring delivery. Several islands
 * of the page read it (options, purchase panel, sticky buy bar).
 */
export interface Purchase {
  variantIndex: number;
  quantity: number;
  mode: 'once' | 'recurring';
  intervalWeeks: number;
}

export const $purchase = atom<Purchase>({ variantIndex: 0, quantity: 1, mode: 'once', intervalWeeks: 4 });

export const updatePurchase = (patch: Partial<Purchase>): void => $purchase.set({ ...$purchase.get(), ...patch });

/** The part of a product the purchase islands need; the page passes only this to them. */
export type PurchasableProduct = Pick<Product, 'handle' | 'title' | 'unitLabel' | 'image' | 'price' | 'optionName' | 'variants'>;

export interface PurchaseView {
  variant: Variant;
  recurring: boolean;
  /** Index of the volume tier the quantity reaches. */
  tierIndex: number;
  /** Price of one unit at quantity 1, before any discount. */
  baseAmount: number;
  /** Price of one unit at this quantity and schedule. */
  unitAmount: number;
  totalAmount: number;
  savedAmount: number;
}

/** Everything the page shows that depends on the selection, predicted from the product's price tiers. */
export function purchaseView(product: PurchasableProduct, purchase: Purchase, policy: RecurringPolicy): PurchaseView {
  const variant = product.variants[Math.min(purchase.variantIndex, product.variants.length - 1)] ?? product.variants[0];
  if (!variant) throw new Error(`Product "${product.handle}" has no variants.`);
  const recurring = purchase.mode === 'recurring';
  const unit = unitAmount(variant, purchase.quantity, recurring ? policy.discountPercent : 0);
  const base = variant.price.amount;
  return {
    variant,
    recurring,
    tierIndex: tierFor(variant.priceTiers, purchase.quantity).index,
    baseAmount: base,
    unitAmount: unit,
    totalAmount: unit * purchase.quantity,
    savedAmount: Math.max(0, (base - unit) * purchase.quantity),
  };
}
