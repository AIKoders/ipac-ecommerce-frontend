import type { Locale } from '@/i18n';
import type { StorefrontApi } from '../contracts';
import { ApiError } from '../errors';
import type {
  AccountOverview,
  BillingProfile,
  Cart,
  Category,
  CheckoutOptions,
  Faq,
  Invoice,
  Order,
  Page,
  Post,
  PostSummary,
  Product,
  ProductQuery,
  ProductSummary,
  Session,
  StoreSettings,
  Subscription,
} from '../types';
import { createKartClient, type KartList, type TokenStore } from './client';

/**
 * The Kart adapter: the same `StorefrontApi`, answered over HTTP.
 *
 * STATUS: provisional. Kart (ecommerce-api-core) has published its conventions
 * (prefix, headers, lists, errors, money, shopper sign-in by emailed code) but
 * not its store routes yet; only `/search`, `/carts/{id}/checkout` and
 * `/checkouts/{id}/complete` are named in its docs. Until
 * `/store/v1/openapi.json` exists:
 *
 * - `ROUTES` holds every path in one place. Correct them there.
 * - Responses are read as the snake_case form of the domain model in
 *   `../types.ts` (`unit_label` → `unitLabel`). Where Kart's resource differs,
 *   reshape it in `adapt` below; nothing outside this file needs to change.
 */
const ROUTES = {
  settings: '/channel',
  categories: '/categories',
  category: (handle: string) => `/categories/${encodeURIComponent(handle)}`,
  products: '/products',
  product: (handle: string) => `/products/${encodeURIComponent(handle)}`,
  search: '/search',
  posts: '/pages',
  post: (slug: string) => `/pages/${encodeURIComponent(slug)}`,
  faqs: '/faqs',
  carts: '/carts',
  cart: (id: string) => `/carts/${id}`,
  cartLines: (id: string) => `/carts/${id}/lines`,
  cartLine: (id: string, lineId: string) => `/carts/${id}/lines/${encodeURIComponent(lineId)}`,
  cartCheckout: (id: string) => `/carts/${id}/checkout`,
  checkoutComplete: (id: string) => `/checkouts/${id}/complete`,
  checkoutOptions: (id: string) => `/carts/${id}/checkout-options`,
  authRequestCode: '/auth/email-code',
  authVerifyCode: '/auth/email-code/verify',
  authSignOut: '/auth/sign-out',
  me: '/customers/me',
  overview: '/customers/me/overview',
  billing: '/customers/me/billing',
  orders: '/orders',
  order: (number: string) => `/orders/${encodeURIComponent(number)}`,
  reorder: (id: string) => `/orders/${id}/reorder`,
  subscriptions: '/subscriptions',
  subscription: (id: string) => `/subscriptions/${id}`,
  subscriptionSkip: (id: string) => `/subscriptions/${id}/skip`,
  invoices: '/invoices',
  contact: '/forms/contact',
  newsletter: '/forms/newsletter',
} as const;

const SESSION_KEY = 'ipac.kart.session';
const CART_KEY = 'ipac.kart.cart';

const camel = (key: string) => key.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());

/** Kart writes snake_case; the domain model is camelCase. */
function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((item) => camelize(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [camel(key), camelize(inner)])) as T;
  }
  return value as T;
}

const snake = (key: string) => key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

function snakeize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [snake(key), snakeize(inner)]));
  }
  return value;
}

const adapt = {
  page<T>(list: KartList<unknown>): Page<T> {
    const items = camelize<T[]>(list.data);
    const total = typeof list.total_count === 'number' ? list.total_count : items.length;
    return { items, hasMore: list.has_more, nextCursor: list.next_cursor, totalCount: total };
  },
  resource: <T>(dto: unknown): T => camelize<T>(dto),
};

const SORT: Record<NonNullable<ProductQuery['sort']>, string | undefined> = {
  featured: undefined,
  price_asc: 'price',
  price_desc: '-price',
  top_rated: '-rating',
};

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

export function createHttpApi(locale: Locale): StorefrontApi {
  const readSession = (): StoredSession | null => {
    try {
      return JSON.parse(storage()?.getItem(SESSION_KEY) ?? 'null') as StoredSession | null;
    } catch {
      return null;
    }
  };
  const readCartRef = (): { id: string; token: string } | null => {
    try {
      return JSON.parse(storage()?.getItem(CART_KEY) ?? 'null') as { id: string; token: string } | null;
    } catch {
      return null;
    }
  };

  const tokens: TokenStore = {
    getAccessToken: () => readSession()?.accessToken ?? null,
    getCartToken: () => readCartRef()?.token ?? null,
  };
  const kart = createKartClient(locale, tokens);

  /** The guest's cart is created on first use and remembered by its token. */
  async function cartId(): Promise<string> {
    const existing = readCartRef();
    if (existing) return existing.id;
    const created = await kart.request<{ id: string; token: string }>(ROUTES.carts, { method: 'POST', body: {} });
    storage()?.setItem(CART_KEY, JSON.stringify({ id: created.id, token: created.token }));
    return created.id;
  }

  const getCart = async (): Promise<Cart> => adapt.resource<Cart>(await kart.request(ROUTES.cart(await cartId())));

  return {
    store: {
      getSettings: async () => adapt.resource<StoreSettings>(await kart.request(ROUTES.settings)),
    },

    catalog: {
      listCategories: async () => adapt.page<Category>(await kart.request<KartList<unknown>>(ROUTES.categories, { query: { limit: 200 } })).items,
      getCategory: async (handle) => adapt.resource<Category>(await kart.request(ROUTES.category(handle))),
      async listProducts(query = {}) {
        const searching = Boolean(query.q);
        return adapt.page<ProductSummary>(
          await kart.request<KartList<unknown>>(searching ? ROUTES.search : ROUTES.products, {
            query: {
              q: query.q,
              category: query.category,
              'price[gte]': query.priceMin,
              'price[lte]': query.priceMax,
              'handle[in]': query.handles?.join(','),
              featured: query.featured,
              sort: query.sort ? SORT[query.sort] : undefined,
              limit: query.limit ?? 50,
              cursor: query.cursor,
              count: true,
            },
          }),
        );
      },
      getProduct: async (handle) => adapt.resource<Product>(await kart.request(ROUTES.product(handle), { query: { expand: ['variants', 'media', 'related'] } })),
    },

    content: {
      listPosts: async () => adapt.page<PostSummary>(await kart.request<KartList<unknown>>(ROUTES.posts, { query: { kind: 'post', sort: '-published_at' } })).items,
      getPost: async (slug) => adapt.resource<Post>(await kart.request(ROUTES.post(slug))),
      listFaqs: async () => adapt.page<Faq>(await kart.request<KartList<unknown>>(ROUTES.faqs)).items,
    },

    cart: {
      get: getCart,
      async addLines(lines) {
        const id = await cartId();
        return adapt.resource<Cart>(await kart.request(ROUTES.cartLines(id), { method: 'POST', body: { lines: snakeize(lines) } }));
      },
      async setQuantity(lineId, quantity) {
        const id = await cartId();
        return adapt.resource<Cart>(await kart.request(ROUTES.cartLine(id, lineId), quantity > 0 ? { method: 'PATCH', body: { quantity } } : { method: 'DELETE' }));
      },
      async setFulfillment(method) {
        const id = await cartId();
        return adapt.resource<Cart>(await kart.request(ROUTES.cart(id), { method: 'PATCH', body: { fulfillment_method: method } }));
      },
    },

    checkout: {
      getOptions: async () => adapt.resource<CheckoutOptions>(await kart.request(ROUTES.checkoutOptions(await cartId()))),
      async placeOrder(input) {
        const { idempotencyKey, ...body } = input;
        const checkout = await kart.request<{ id: string }>(ROUTES.cartCheckout(await cartId()), { method: 'POST', body: snakeize(body), idempotencyKey: `${idempotencyKey}:checkout` });
        const order = adapt.resource<Order>(await kart.request(ROUTES.checkoutComplete(checkout.id), { method: 'POST', idempotencyKey }));
        storage()?.removeItem(CART_KEY);
        return order;
      },
    },

    auth: {
      async getSession() {
        if (!readSession()) return null;
        try {
          return { customer: adapt.resource<Session['customer']>(await kart.request(ROUTES.me)) };
        } catch (error) {
          if (error instanceof ApiError && error.code === 'unauthenticated') {
            storage()?.removeItem(SESSION_KEY);
            return null;
          }
          throw error;
        }
      },
      requestCode: (email) => kart.request<void>(ROUTES.authRequestCode, { method: 'POST', body: { email } }),
      async verifyCode(email, code) {
        const result = await kart.request<{ access_token: string; refresh_token: string; customer: unknown }>(ROUTES.authVerifyCode, { method: 'POST', body: { email, code } });
        storage()?.setItem(SESSION_KEY, JSON.stringify({ accessToken: result.access_token, refreshToken: result.refresh_token } satisfies StoredSession));
        return { customer: adapt.resource<Session['customer']>(result.customer) };
      },
      async signOut() {
        try {
          await kart.request<void>(ROUTES.authSignOut, { method: 'POST', body: { refresh_token: readSession()?.refreshToken } });
        } finally {
          storage()?.removeItem(SESSION_KEY);
        }
      },
    },

    account: {
      getOverview: async () => adapt.resource<AccountOverview>(await kart.request(ROUTES.overview)),
      listOrders: async (filter) => adapt.page<Order>(await kart.request<KartList<unknown>>(ROUTES.orders, { query: { status: filter?.status, sort: '-placed_at' } })).items,
      getOrder: async (number) => adapt.resource<Order>(await kart.request(ROUTES.order(number))),
      reorder: async (orderId) => adapt.resource<Cart>(await kart.request(ROUTES.reorder(orderId), { method: 'POST', body: { cart_id: await cartId() } })),
      listSubscriptions: async () => adapt.page<Subscription>(await kart.request<KartList<unknown>>(ROUTES.subscriptions)).items,
      createSubscriptionFromOrder: async (orderId) => adapt.resource<Subscription>(await kart.request(ROUTES.subscriptions, { method: 'POST', body: { order_id: orderId } })),
      updateSubscription: async (id, patch) => adapt.resource<Subscription>(await kart.request(ROUTES.subscription(id), { method: 'PATCH', body: snakeize(patch) })),
      skipNextDelivery: async (id) => adapt.resource<Subscription>(await kart.request(ROUTES.subscriptionSkip(id), { method: 'POST' })),
      cancelSubscription: (id) => kart.request<void>(ROUTES.subscription(id), { method: 'DELETE' }),
      listInvoices: async () => adapt.page<Invoice>(await kart.request<KartList<unknown>>(ROUTES.invoices)).items,
      getBilling: async () => adapt.resource<BillingProfile>(await kart.request(ROUTES.billing)),
    },

    forms: {
      submitContact: (input) => kart.request<void>(ROUTES.contact, { method: 'POST', body: snakeize(input) }),
      subscribeNewsletter: (email) => kart.request<void>(ROUTES.newsletter, { method: 'POST', body: { email } }),
    },
  };
}
