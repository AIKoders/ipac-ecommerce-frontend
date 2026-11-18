/**
 * The public environment, read once. Everything here is safe in the browser;
 * server-only values (KPulse's key) are read where they are used, from
 * `astro:env/server`. The schema that validates these at build time is in
 * astro.config.ts.
 */
const raw = import.meta.env;

export type AppEnv = 'production' | 'staging' | 'development';
export type ApiMode = 'mock' | 'http';

export const env = {
  siteUrl: String(raw.PUBLIC_SITE_URL || 'http://localhost:4321').replace(/\/$/, ''),
  appEnv: (['production', 'staging'].includes(String(raw.PUBLIC_APP_ENV)) ? raw.PUBLIC_APP_ENV : 'development') as AppEnv,
  indexable: String(raw.PUBLIC_INDEXABLE) === 'true',
  apiMode: (raw.PUBLIC_API_MODE === 'http' ? 'http' : 'mock') as ApiMode,
  apiUrl: String(raw.PUBLIC_API_URL || '').replace(/\/$/, ''),
  kartKey: String(raw.PUBLIC_KART_KEY || ''),
} as const;
