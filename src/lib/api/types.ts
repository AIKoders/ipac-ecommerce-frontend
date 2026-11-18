/**
 * The storefront's domain model: what pages and islands work with.
 *
 * It is owned by the frontend and written in camelCase. The mock adapter
 * returns these shapes directly; the HTTP adapter maps Kart's resources
 * (snake_case, TypeIDs, money in minor units) into them, so a change in the
 * backend's wire format is absorbed in `http/` and nowhere else.
 *
 * Conventions shared with Kart:
 * - IDs are opaque strings (`prod_…`, `var_…`, `ord_…`).
 * - Money is an integer amount in minor units plus an ISO currency.
 * - Timestamps are ISO 8601 strings.
 * - Text is already in the request's locale.
 */

export interface Money {
  /** Minor units: 2875 is $28.75. */
  amount: number;
  currency: string;
}

export interface Media {
  url: string;
  width: number;
  height: number;
  alt: string;
  /** Ready-made `srcset`, when the source has more than one width. */
  srcset?: string;
}

/** A page of a cursor-paginated list (Kart: `{ object: "list", data, has_more, next_cursor }`). */
export interface Page<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
}

// ---------------------------------------------------------------- catalog

export interface CategoryRef {
  id: string;
  handle: string;
  name: string;
}

export interface Category extends CategoryRef {
  description: string;
  image: Media;
  productCount: number;
}

export type ProductBadge = 'best_seller' | 'popular';

export interface Rating {
  average: number;
  count: number;
}

/** A volume price: `price` applies from `minQuantity` units up. Sorted by `minQuantity`, the first tier starts at 1. */
export interface PriceTier {
  minQuantity: number;
  price: Money;
}

export interface Variant {
  id: string;
  sku: string;
  /** "12 × 12 × 12 in"; null when the product has a single variant. */
  title: string | null;
  price: Money;
  priceTiers: PriceTier[];
  available: boolean;
}

/** What a card, a cart recommendation or a search hit needs. */
export interface ProductSummary {
  id: string;
  handle: string;
  title: string;
  summary: string;
  sku: string;
  /** How it is sold: "Bundle of 25", "Case of 500". */
  unitLabel: string;
  category: CategoryRef;
  image: Media;
  badge: ProductBadge | null;
  rating: Rating;
  /** Price of the default variant at quantity 1. */
  price: Money;
  /** The lowest volume price of the default variant. */
  bulkPrice: Money;
  defaultVariantId: string;
}

export interface Specification {
  label: string;
  value: string;
}

export interface Product extends ProductSummary {
  features: string[];
  specifications: Specification[];
  /** Name of the option the variants differ by ("Size"); null for single-variant products. */
  optionName: string | null;
  variants: Variant[];
  frequentlyBoughtWith: ProductSummary[];
  related: ProductSummary[];
}

export type ProductSort = 'featured' | 'price_asc' | 'price_desc' | 'top_rated';

export interface ProductQuery {
  /** Category handle. */
  category?: string;
  /** Free-text search. */
  q?: string;
  /** Price bounds of the default variant, in minor units, both inclusive. */
  priceMin?: number;
  priceMax?: number;
  sort?: ProductSort;
  /** Only products flagged as featured (the home page's "most reordered"). */
  featured?: boolean;
  handles?: string[];
  limit?: number;
  cursor?: string;
}

// ------------------------------------------------------------------- store

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface RecurringPolicy {
  discountPercent: number;
  intervalWeeks: number[];
  defaultIntervalWeeks: number;
}

/** Channel-level settings every page may need. Contact fields are null until the business fills them in. */
export interface StoreSettings {
  name: string;
  legalName: string;
  currency: string;
  serviceArea: string;
  freeDeliveryThreshold: Money;
  recurring: RecurringPolicy;
  contact: {
    phone: string | null;
    email: string | null;
    address: Address | null;
  };
  social: {
    facebook: string | null;
    instagram: string | null;
  };
}

// -------------------------------------------------------------------- cart

export type FulfillmentMethod = 'local_delivery' | 'pickup' | 'shipping';

export interface CartLine {
  id: string;
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  variantTitle: string | null;
  unitLabel: string;
  image: Media;
  quantity: number;
  /** After volume tiers and the recurring discount. */
  unitPrice: Money;
  lineTotal: Money;
  /** Weeks between deliveries when the line is a recurring order; null for a one-time purchase. */
  intervalWeeks: number | null;
}

export interface Totals {
  subtotal: Money;
  shipping: Money;
  tax: Money;
  total: Money;
}

export interface Cart {
  id: string;
  lines: CartLine[];
  /** Units, not lines. */
  itemCount: number;
  fulfillmentMethod: FulfillmentMethod;
  totals: Totals;
  freeDelivery: {
    threshold: Money;
    remaining: Money;
    /** 0 to 1. */
    progress: number;
  };
  hasRecurring: boolean;
}

export interface AddLineInput {
  variantId: string;
  quantity: number;
  intervalWeeks?: number | null;
}

// ---------------------------------------------------------------- checkout

export interface ShippingOption {
  method: FulfillmentMethod;
  amount: Money;
  /** ISO date the order is expected, when the method has one. */
  estimatedDate: string | null;
}

export type PaymentMethod = 'card' | 'net_terms';

export interface CheckoutOptions {
  shipping: ShippingOption[];
  payment: PaymentMethod[];
}

export interface PlaceOrderInput {
  /** Required for guests; signed-in customers use the account's. */
  email?: string;
  phone?: string;
  fulfillmentMethod: FulfillmentMethod;
  shipTo: {
    company?: string;
    name?: string;
    line1?: string;
    city?: string;
    postalCode?: string;
    notes?: string;
  };
  payment: {
    method: PaymentMethod;
    /** Token from the payment provider's hosted fields. Card data never passes through the storefront. */
    token?: string;
    poNumber?: string;
  };
  /** Makes the request safe to retry (Kart: `Idempotency-Key`). */
  idempotencyKey: string;
}

// ------------------------------------------------------------------ orders

export type OrderStatus = 'open' | 'completed' | 'canceled';
export type PaymentStatus = 'pending' | 'paid' | 'on_terms';
export type FulfillmentStatus = 'pending' | 'in_progress' | 'out_for_delivery' | 'delivered';

export interface OrderLine {
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  variantTitle: string | null;
  image: Media;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  intervalWeeks: number | null;
}

export interface Order {
  id: string;
  /** The number people see: "IP-48263". */
  number: string;
  placedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillment: {
    method: FulfillmentMethod;
    status: FulfillmentStatus;
    estimatedDate: string | null;
  };
  lines: OrderLine[];
  itemCount: number;
  totals: Totals;
  email: string | null;
  hasRecurring: boolean;
  /** Placed without an account. */
  guest: boolean;
}

export type SubscriptionStatus = 'active' | 'paused';

export interface Subscription {
  id: string;
  number: string;
  status: SubscriptionStatus;
  intervalWeeks: number;
  /** Null while paused. */
  nextDeliveryAt: string | null;
  lines: OrderLine[];
  perDelivery: Money;
}

export interface SubscriptionPatch {
  intervalWeeks?: number;
  status?: SubscriptionStatus;
}

export type InvoiceStatus = 'paid' | 'due_on_delivery';

export interface Invoice {
  id: string;
  number: string;
  orderNumber: string;
  issuedAt: string;
  total: Money;
  status: InvoiceStatus;
}

// ----------------------------------------------------------------- account

export interface Customer {
  id: string;
  firstName: string;
  company: string;
  email: string;
}

export interface Session {
  customer: Customer;
}

export interface RestockSuggestion {
  product: ProductSummary;
  daysLeft: number;
  /** 0 to 100, of the estimated supply. */
  percentLeft: number;
  due: boolean;
  lastOrderedAt: string;
}

export type NextDelivery = { kind: 'order'; order: Order } | { kind: 'subscription'; subscription: Subscription };

export interface AccountOverview {
  stats: {
    orderCount: number;
    totalSpent: Money;
    activeSubscriptions: number;
  };
  next: NextDelivery | null;
  lastOrder: Order | null;
  restock: RestockSuggestion[];
  buyAgain: ProductSummary[];
}

export interface SavedAddress {
  id: string;
  label: string;
  isDefault: boolean;
  address: Address | null;
  note: string | null;
}

export interface BillingProfile {
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  netTermsAvailable: boolean;
  addresses: SavedAddress[];
}

// ----------------------------------------------------------------- content

/** Color treatment of a post's cover tile; presentation data that travels with the post. */
export type PostTone = 'tint' | 'yellow' | 'paper' | 'mint' | 'navy';

export interface PostSummary {
  id: string;
  slug: string;
  tag: string;
  tone: PostTone;
  image: Media;
  readMinutes: number;
  title: string;
  excerpt: string;
  publishedAt: string;
}

export interface Post extends PostSummary {
  body: string[];
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export type ContactTopic = 'quote' | 'consultation' | 'order' | 'account' | 'other';

export interface ContactInput {
  name: string;
  business?: string;
  email: string;
  phone?: string;
  topic: ContactTopic;
  message: string;
}
