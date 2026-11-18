import type {
  AccountOverview,
  AddLineInput,
  BillingProfile,
  Cart,
  Category,
  CheckoutOptions,
  ContactInput,
  Faq,
  FulfillmentMethod,
  Invoice,
  Order,
  OrderStatus,
  Page,
  PlaceOrderInput,
  Post,
  PostSummary,
  Product,
  ProductQuery,
  ProductSummary,
  Session,
  StoreSettings,
  Subscription,
  SubscriptionPatch,
} from './types';

/**
 * The port between the storefront and its backend. Pages, islands and stores
 * depend on this interface only; `getApi()` decides which adapter answers.
 *
 * An instance is bound to one locale, the way an HTTP client is bound to one
 * `Accept-Language`. Every method rejects with `ApiError` (see errors.ts).
 *
 * Catalog, content and store settings are also read while the site builds, so
 * those methods must work without a browser. Everything else is called from
 * the browser on behalf of one shopper.
 */
export interface StorefrontApi {
  store: {
    getSettings(): Promise<StoreSettings>;
  };

  catalog: {
    listCategories(): Promise<Category[]>;
    getCategory(handle: string): Promise<Category>;
    listProducts(query?: ProductQuery): Promise<Page<ProductSummary>>;
    getProduct(handle: string): Promise<Product>;
  };

  content: {
    listPosts(): Promise<PostSummary[]>;
    getPost(slug: string): Promise<Post>;
    listFaqs(): Promise<Faq[]>;
  };

  cart: {
    get(): Promise<Cart>;
    /** Adds to the matching line (same variant and schedule) or creates one. */
    addLines(lines: AddLineInput[]): Promise<Cart>;
    /** A quantity of 0 removes the line. */
    setQuantity(lineId: string, quantity: number): Promise<Cart>;
    setFulfillment(method: FulfillmentMethod): Promise<Cart>;
  };

  checkout: {
    getOptions(): Promise<CheckoutOptions>;
    /** Turns the cart into an order and empties it. Recurring lines become subscriptions. */
    placeOrder(input: PlaceOrderInput): Promise<Order>;
  };

  auth: {
    getSession(): Promise<Session | null>;
    /** Emails a 6-digit sign-in code. Shoppers have no passwords. */
    requestCode(email: string): Promise<void>;
    verifyCode(email: string, code: string): Promise<Session>;
    signOut(): Promise<void>;
  };

  account: {
    getOverview(): Promise<AccountOverview>;
    listOrders(filter?: { status?: OrderStatus }): Promise<Order[]>;
    getOrder(number: string): Promise<Order>;
    /** Puts every line of a past order back in the cart, as one-time purchases. */
    reorder(orderId: string): Promise<Cart>;
    listSubscriptions(): Promise<Subscription[]>;
    createSubscriptionFromOrder(orderId: string): Promise<Subscription>;
    updateSubscription(id: string, patch: SubscriptionPatch): Promise<Subscription>;
    skipNextDelivery(id: string): Promise<Subscription>;
    cancelSubscription(id: string): Promise<void>;
    listInvoices(): Promise<Invoice[]>;
    getBilling(): Promise<BillingProfile>;
  };

  forms: {
    submitContact(input: ContactInput): Promise<void>;
    subscribeNewsletter(email: string): Promise<void>;
  };
}
