import { env } from '@/config/env';
import { intlLocale, type Locale } from '@/i18n';
import { ApiError, type FieldError } from '../errors';

/**
 * The transport for Kart's store surface (`/store/v1`), following its
 * documented conventions (docs/api.md in ecommerce-api-core):
 *
 * - `X-Kart-Key: pk_…` identifies the channel; a shopper adds `Authorization: Bearer …`.
 * - `Accept-Language` picks the locale of every text field.
 * - Errors are RFC 9457 problem+json with a stable `code`.
 * - Writes that create something carry an `Idempotency-Key`.
 * - Lists are `{ object: "list", data, has_more, next_cursor }`; unknown fields are ignored.
 */
export interface KartList<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
  total_count?: number | string;
}

interface Problem {
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  errors?: FieldError[];
  request_id?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface KartClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

/** Where the shopper's access token and the guest cart token are kept between requests. */
export interface TokenStore {
  getAccessToken(): string | null;
  getCartToken(): string | null;
}

const TIMEOUT_MS = 12_000;

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(`${env.apiUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(`${key}[]`, item);
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function createKartClient(locale: Locale, tokens: TokenStore): KartClient {
  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      if (!env.apiUrl) throw new ApiError({ code: 'unavailable', status: 503, message: 'PUBLIC_API_URL is not set.' });
      const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': intlLocale[locale] };
      if (env.kartKey) headers['X-Kart-Key'] = env.kartKey;
      const access = tokens.getAccessToken();
      if (access) headers.Authorization = `Bearer ${access}`;
      const cartToken = tokens.getCartToken();
      if (cartToken) headers['X-Kart-Cart-Token'] = cartToken;
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

      let response: Response;
      try {
        response = await fetch(buildUrl(path, options.query), {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: options.signal ?? AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (cause) {
        throw new ApiError({ code: 'network_error', status: 0, message: cause instanceof Error ? cause.message : 'The request did not reach the API.' });
      }

      if (response.status === 204) return undefined as T;
      const text = await response.text();
      const data = text ? (JSON.parse(text) as unknown) : undefined;
      if (response.ok) return data as T;

      const problem = (data ?? {}) as Problem;
      throw new ApiError({
        code: problem.code ?? 'internal_error',
        status: problem.status ?? response.status,
        message: problem.detail ?? problem.title ?? response.statusText,
        errors: problem.errors,
        requestId: problem.request_id ?? response.headers.get('X-Request-Id'),
      });
    },
  };
}
