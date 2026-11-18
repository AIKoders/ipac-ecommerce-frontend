import { createHash } from 'node:crypto';
import preact from '@astrojs/preact';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField, fontProviders } from 'astro/config';
import { INLINE_SCRIPTS } from './src/config/inline-scripts';

// Astro only exposes .env files to import.meta.env; the values below are read
// from process.env while the config loads. Variables already set (Vercel, the
// shell) win, and .env.local wins over .env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile?.(new URL(file, import.meta.url));
  } catch {
    // no such file
  }
}

/**
 * Canonical origin of this deployment. Production and staging set it; a
 * preview deployment falls back to its own Vercel address, local work to the
 * dev server. Written back so pages and islands read the same value.
 */
const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
const SITE = (process.env.PUBLIC_SITE_URL || (previewHost ? `https://${previewHost}` : 'http://localhost:4321')).replace(/\/$/, '');
process.env.PUBLIC_SITE_URL = SITE;

/** The store API's origin, allowed in connect-src once the mock is swapped out. */
const API_ORIGIN = (() => {
  try {
    return process.env.PUBLIC_API_URL ? new URL(process.env.PUBLIC_API_URL).origin : null;
  } catch {
    return null;
  }
})();

/** KPulse's status host serves the maintenance script for prerendered pages. */
const KPULSE_STATUS = 'https://status.aikoders.us';

/**
 * A self-hosted variable family from its Fontsource package. Only the Latin
 * subset is loaded: it covers English and Spanish, and it is the file the
 * layout preloads.
 */
function variableFont(f: { name: string; cssVariable: `--${string}`; pkg: string; file: string; weight: string; fallbacks: string[] }) {
  return {
    provider: fontProviders.local(),
    name: f.name,
    cssVariable: f.cssVariable,
    fallbacks: f.fallbacks,
    options: {
      variants: [{ src: [`${f.pkg}/files/${f.file}`], weight: f.weight, style: 'normal' }] as [any, ...any[]],
    },
  };
}

const sha256 = (source: string) => `sha256-${createHash('sha256').update(source).digest('base64')}` as const;

// https://astro.build/config
export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: vercel({ webAnalytics: { enabled: false } }),
  integrations: [preact()],
  trailingSlash: 'never',
  build: {
    format: 'file',
    // The whole critical CSS travels with the HTML: no render-blocking request on first paint.
    inlineStylesheets: 'always',
  },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
  // No Markdown is rendered; Shiki's inline styles would also fight the CSP.
  markdown: { syntaxHighlight: false },
  i18n: {
    locales: ['en', 'es'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  fonts: [
    variableFont({
      name: 'Inter',
      cssVariable: '--font-inter',
      pkg: '@fontsource-variable/inter',
      file: 'inter-latin-wght-normal.woff2',
      weight: '100 900',
      fallbacks: ['system-ui', 'sans-serif'],
    }),
    variableFont({
      name: 'Space Grotesk',
      cssVariable: '--font-space-grotesk',
      pkg: '@fontsource-variable/space-grotesk',
      file: 'space-grotesk-latin-wght-normal.woff2',
      weight: '300 700',
      fallbacks: ['system-ui', 'sans-serif'],
    }),
  ],
  env: {
    validateSecrets: true,
    schema: {
      PUBLIC_SITE_URL: envField.string({ context: 'client', access: 'public', default: 'http://localhost:4321', url: true }),
      PUBLIC_APP_ENV: envField.enum({ context: 'client', access: 'public', values: ['production', 'staging', 'development'], default: 'development' }),
      PUBLIC_INDEXABLE: envField.boolean({ context: 'client', access: 'public', default: false }),
      PUBLIC_API_MODE: envField.enum({ context: 'client', access: 'public', values: ['mock', 'http'], default: 'mock' }),
      PUBLIC_API_URL: envField.string({ context: 'client', access: 'public', optional: true, url: true }),
      PUBLIC_KART_KEY: envField.string({ context: 'client', access: 'public', optional: true, startsWith: 'pk_' }),
      KPULSE_URL: envField.string({ context: 'server', access: 'public', default: 'https://kpulse.aikoders.us', url: true }),
      KPULSE_ENVIRONMENT: envField.string({ context: 'server', access: 'public', optional: true }),
      KPULSE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  security: {
    // Hash-based policy in a <meta> on every page; frame-ancestors and the
    // other header-only directives live in vercel.json.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        `connect-src 'self' ${KPULSE_STATUS}${API_ORIGIN ? ` ${API_ORIGIN}` : ''}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ],
      scriptDirective: {
        resources: ["'self'", KPULSE_STATUS],
        hashes: Object.values(INLINE_SCRIPTS).map(sha256),
      },
      styleDirective: {
        // Progress bars, meters and star ratings set a width inline.
        resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
