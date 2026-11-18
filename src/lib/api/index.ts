import type { Locale } from '@/i18n';
import type { StorefrontApi } from './contracts';
import { createHttpApi } from './http';
import { createMockApi } from './mock';

/**
 * The storefront's only door to its data.
 *
 *   const api = getApi(locale);
 *   const product = await api.catalog.getProduct(handle);
 *
 * `PUBLIC_API_MODE` picks the adapter: `mock` (fixtures and localStorage) or
 * `http` (Kart). Nothing outside this folder imports an adapter directly, so
 * moving to the real backend is a change of environment variables.
 */
const instances = new Map<Locale, StorefrontApi>();

// Read straight from import.meta.env so the bundler sees a constant: the
// adapter that is not selected (and, for the mock, its fixtures) is left out
// of the build.
const createApi = import.meta.env.PUBLIC_API_MODE === 'http' ? createHttpApi : createMockApi;

export function getApi(locale: Locale): StorefrontApi {
  let api = instances.get(locale);
  if (!api) {
    api = createApi(locale);
    instances.set(locale, api);
  }
  return api;
}

export type { StorefrontApi } from './contracts';
export { ApiError, isApiError } from './errors';
export type * from './types';
