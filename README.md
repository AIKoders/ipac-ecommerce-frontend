# ipac storefront

The online store of **ipac** (IPAC Industries LLC): business supplies for Southwest Florida. Catalog, cart, guest checkout, recurring orders and a customer account, in English and Spanish.

The backend is mocked behind a single interface so the store runs today and moves to the real API ([Kart](https://github.com/AIKoders/ecommerce-api-core)) by changing environment variables.

| | |
|---|---|
| Production | https://ipac-ecommerce.aikoders.us |
| Staging | https://ipac-ecommerce-dev.aikoders.us |

## Tech stack

- **Astro 7**, static output, on **Vercel** (`@astrojs/vercel`); two on-demand routes (`/api/health`, `/api/kpulse`)
- **Preact** islands and **nanostores** for the interactive parts
- **Tailwind v4** for tokens and utilities, plus the design system's own component classes
- **Bun** as package manager, script runner and test runner
- **TypeScript**, strict

## Getting started

```bash
bun install
```

```bash
bun run dev
```

The dev server runs at http://localhost:4321. Local variables: copy `.env.example` to `.env`, or pull them from Koda (`ipac / storefront / local`).

| Command | What it does |
|---|---|
| `bun run dev` | Dev server |
| `bun run build` | Production build into `.vercel/output` |
| `bun run check` | Type check (`astro check`) |
| `bun test` | Unit tests: pricing, dictionaries, the mock backend |
| `bun run images` | Rebuild `public/media` from `src/assets/media` |
| `bun scripts/build-icons.ts` | Rebuild the favicon and app icons |

## Project structure

```
src/
  pages/
    [...lang]/           every page, once: /… in English, /es/… in Spanish
    api/                 health check and the browser-error relay (on demand)
    og/                  Open Graph cards, drawn at build time
    robots.txt.ts, sitemap.xml.ts, llms.txt.ts, manifest.webmanifest.ts
  layouts/BaseLayout.astro
  components/
    layout/              header, footer, loader
    home/, shop/, ui/    static sections and primitives (.astro)
    islands/             interactive regions (Preact)
    seo/Seo.astro
  lib/
    api/                 the data layer (see below)
    pricing.ts, format.ts, seo.ts, og.ts, media/
    kpulse/              maintenance gate and error reporting
  stores/                cart, session, header panels, loader (nanostores)
  i18n/                  locales/{en,es}/<namespace>.json and helpers
  styles/                global.css (tokens) and one sheet per area
  scripts/               small page scripts: header, hero, reveal, loader
  config/                env, site constants, hashed inline scripts
public/media/            responsive image variants
test/
```

## The data layer

Everything the store reads or writes goes through one interface:

```ts
import { getApi } from '@/lib/api';

const api = getApi(locale);
const product = await api.catalog.getProduct(handle);
const cart = await api.cart.addLines([{ variantId, quantity: 2 }]);
```

| File | Role |
|---|---|
| `src/lib/api/types.ts` | The storefront's domain model |
| `src/lib/api/contracts.ts` | `StorefrontApi`, the port: catalog, content, cart, checkout, auth, account, forms |
| `src/lib/api/mock/` | A backend in the browser: fixtures plus `localStorage`, with the business rules a backend owns (volume tiers, recurring discount, shipping, tax) |
| `src/lib/api/http/` | The adapter for Kart: `X-Kart-Key`, `Accept-Language`, problem+json errors, cursor lists, idempotency keys |
| `src/lib/api/index.ts` | `getApi()`, which picks the adapter from `PUBLIC_API_MODE` |

Pages, islands and stores never import an adapter or a fixture, and never compute a total: they render what the API returns.

### Moving from the mock to Kart

1. Set `PUBLIC_API_MODE=http`, `PUBLIC_API_URL` (the store surface, `…/store/v1`) and `PUBLIC_KART_KEY` (`pk_…`) in Koda for the environment.
2. Kart has not published its store routes yet. When it does, check the `ROUTES` table and the `adapt` mappers at the top of `src/lib/api/http/index.ts` against its OpenAPI: they are the only code that knows the wire format.
3. Deploy. The mock and its fixtures are left out of the bundle automatically.

Catalog pages are prerendered, so with a live backend a catalog change needs a new build; switching those routes to ISR is a one-line change in `astro.config.ts` (`adapter: vercel({ isr: … })`).

### Editing the mock catalog

Fixtures are in `src/lib/api/mock/fixtures/*.json`, with text as `{ "en": …, "es": … }`. Store-level settings (free-delivery threshold, tax rate, shipping rates, contact details, social links) are in `store.json`. Contact fields left as `null` are hidden on the site.

## Environment variables

Values live in **Koda**: project `ipac`, system `storefront`, environments `production`, `staging`, `development` (Vercel previews) and `local`. Koda syncs them to the Vercel project both ways, automatically: `production` → Production, `staging` → the custom environment `staging`, `development` → Preview and Development. Change a value in Koda, not in Vercel.

| Variable | Where | Purpose |
|---|---|---|
| `PUBLIC_SITE_URL` | build, browser | Canonical origin. Previews fall back to their Vercel URL |
| `PUBLIC_APP_ENV` | build, browser | `production`, `staging` or `development` |
| `PUBLIC_INDEXABLE` | build | `true` only in production; everything else sends `noindex` |
| `PUBLIC_API_MODE` | build, browser | `mock` or `http` |
| `PUBLIC_API_URL` | build, browser | Kart store surface (http mode) |
| `PUBLIC_KART_KEY` | build, browser | Kart publishable key, `pk_…` (http mode) |
| `KPULSE_URL` | server | KPulse address |
| `KPULSE_ENVIRONMENT` | server | Environment reported to KPulse |
| `KPULSE_KEY` | server, secret | KPulse ingest key for error reports |

The schema that validates them at build time is in `astro.config.ts` (`env.schema`).

## Environments and deploys

Vercel project `ipac-ecommerce` (team `aikoders`), connected to this repository.

| | Domain | Branch | Vercel environment |
|---|---|---|---|
| Production | ipac-ecommerce.aikoders.us | `main` | Production |
| Staging | ipac-ecommerce-dev.aikoders.us | `dev` | custom environment `staging` |
| Preview | per-branch `*.vercel.app` | any other | Preview |

Vercel Authentication (Deployment Protection) is off for this project, so the staging domain opens without a Vercel login; with the team default it stayed behind the login even on its custom domain. Staging and previews are never indexed (`PUBLIC_INDEXABLE=false`, `robots.txt` disallows everything, and `vercel.json` adds `X-Robots-Tag: noindex` on those hosts) and sit behind the same firewall as production.

Pushing a branch deploys it. From a machine:

```bash
vercel deploy --prod --scope aikoders
```

```bash
vercel deploy --target=staging --scope aikoders
```

Firewall rules and how to apply them: [docs/FIREWALL.md](docs/FIREWALL.md).

## Monitoring (KPulse)

Project `ipac`, component `storefront` at https://kpulse.aikoders.us/projects/ipac.

- **Uptime**: monitors on the home page (keyword) and `/api/health` in production and staging, plus the production SSL certificate.
- **Errors**: server errors (middleware) and uncaught browser errors (through `/api/kpulse`, which holds the key) arrive as app lines.
- **Maintenance mode**: a KPulse maintenance window closes the site. On-demand routes are gated in `src/middleware.ts`; prerendered pages load KPulse's page script.
- **Deploys**: the component's Production and Staging environments are linked to the Vercel project, so every deploy shows on its page and charts.
- **Requests and analytics**: the Vercel log drain `KPulse · IPAC Storefront` delivers every request and function line to the source `IPAC Storefront · Vercel`, signed. The drain leaves out `/_astro` and `/media`, the source leaves out `/api/health`. Nothing is sent from the pages for this.

## SEO

Per-page titles and descriptions in both languages, canonical and `hreflang` links, Open Graph and Twitter cards with a generated image per page, JSON-LD (`Organization`, `WebSite` with search, `BreadcrumbList`, `Product` with offers, `BlogPosting`, `FAQPage`), `sitemap.xml`, `robots.txt` and `llms.txt`.

Ratings and reviews in the mock catalog are sample data, so they are never published as structured data.

## Before launch

- Fill the business details in `store.json` (phone, email, warehouse address, social profiles) or serve them from the API.
- Replace the sample reviews on the home page and product pages with real ones.
- Connect a payment provider: the checkout's card fields are a demo and never read or send card data.

---

Site by [AIKODERS LLC](https://aikoders.tech)
