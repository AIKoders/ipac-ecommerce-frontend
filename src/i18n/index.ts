/**
 * Locales and translation helpers.
 *
 * UI strings live in `locales/<locale>/<namespace>.json`; each namespace is
 * exported from `ns/<namespace>.ts` as `{ en, es }`. A component imports only
 * the namespaces it renders, so an island never ships the whole dictionary:
 *
 *   import { cart } from '@/i18n/ns/cart';
 *   const t = translator(cart, locale);
 *   t('freeRemaining', { amount: '$12.00' });
 *
 * Catalog and editorial copy is not here: it comes localized from the API.
 */
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** BCP 47 tags for Intl and <html lang>. */
export const intlLocale: Record<Locale, string> = { en: 'en-US', es: 'es-US' };
export const ogLocale: Record<Locale, string> = { en: 'en_US', es: 'es_US' };

export const isLocale = (value: unknown): value is Locale => (locales as readonly unknown[]).includes(value);

/** `[...lang]` route param → locale. The default locale has no prefix, so its param is undefined. */
export const localeFromParam = (param: string | undefined): Locale => (isLocale(param) ? param : defaultLocale);

/** Static paths for a page that exists in every locale under `src/pages/[...lang]/`. */
export const localeStaticPaths = () => locales.map((locale) => ({ params: { lang: locale === defaultLocale ? undefined : locale } }));

/** `/shop` → `/shop` (en) or `/es/shop` (es). Leaves hashes and query strings alone. */
export function localizePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

/** Splits a pathname into its locale and the locale-free path. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split('/');
  if (isLocale(first) && first !== defaultLocale) return { locale: first, path: `/${rest.join('/')}`.replace(/\/$/, '') || '/' };
  return { locale: defaultLocale, path: pathname.replace(/(.)\/$/, '$1') || '/' };
}

type Dictionary = Record<string, string>;
type Namespace<D extends Dictionary = Dictionary> = Record<Locale, D>;
export type Params = Record<string, string | number>;

/** A typed `t()` for one namespace: unknown keys are compile errors, `{name}` placeholders are filled from `params`. */
export function translator<D extends Dictionary>(namespace: Namespace<D>, locale: Locale) {
  const dictionary = namespace[locale] ?? namespace[defaultLocale];
  return (key: keyof D & string, params?: Params): string => {
    const template = dictionary[key] ?? namespace[defaultLocale][key] ?? key;
    return params ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : template;
  };
}
