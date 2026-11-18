# ipac storefront — agent and coding conventions

Astro 7 storefront for ipac (business supplies, Southwest Florida), English and Spanish, deployed on Vercel. Bun is the package manager and script runner. The backend is mocked behind one interface; the real one is Kart (`ecommerce-api-core`).

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 7, `output: 'static'`, `@astrojs/vercel` (on-demand routes opt in with `prerender = false`) |
| Interactivity | Preact islands + nanostores. No React. |
| Styling | Tailwind v4 (`@tailwindcss/vite`), tokens in `@theme` in `src/styles/global.css`; the design system's component classes in `src/styles/*.css` |
| Data | `getApi(locale)` → `StorefrontApi` (`src/lib/api`). `PUBLIC_API_MODE=mock` or `http` |
| i18n | `en` (no prefix) and `es` (`/es/…`); JSON dictionaries per namespace |
| Checks | `bunx astro check`, `bun test`, `bun run build` |

## Hard rules

- **The design is the spec.** Every page, detail and animation comes from the IPAC design prototype. Keep its classes, copy, motion and responsive behaviour; do not restyle or "simplify".
- **Data only through `getApi(locale)`.** Never import fixtures or an adapter from a page, component or store. Prices and totals come from the API; the UI never computes a total (`src/lib/pricing.ts` only predicts a unit price on the product page).
- **No hardcoded colors.** Use the tokens (`var(--color-navy)`, `text-mist`, `bg-paper`). The Tailwind palette is reset to the brand's, so an off-palette utility does not compile.
- **No hardcoded copy.** UI strings live in `src/i18n/locales/{en,es}/<namespace>.json`, both languages in the same change. Catalog and editorial text comes localized from the API.
- **No TypeScript errors.** Run `bunx astro check` before finishing.
- **No inline event handlers or inline `<script is:inline>`** unless the source is in `src/config/inline-scripts.ts` (the CSP hashes those). Inline `style` attributes are allowed for dynamic values only (a width, a font size from data).
- **Comments say why, not what.** A module gets a short header explaining its role; obvious code gets none.
- Use bun (`bun add`, `bun run`, `bunx`). Never npm, yarn or pnpm.

## Astro 7 specifics

- Close every tag: the compiler does not repair invalid HTML.
- Whitespace follows JSX rules (`compressHTML: 'jsx'`): a line break between elements is dropped. Keep text and the inline element next to it on one line, or rely on `gap`.
- Localized pages live in `src/pages/[...lang]/` and export `getStaticPaths = localeStaticPaths` (or build on it). Read the locale with `localeFromParam(Astro.params.lang)` and build links with `localizePath(locale, '/path')`.
- A page passes `locale`, `title`, `description`, `path` (locale-free) and, when it has one, `ogKey`, `graph` (JSON-LD nodes), `section` and `noindex` to `BaseLayout`. Cart, checkout, account and sign-in pass `noindex`.
- Navigation is real links and real forms (`<a href>`, `<form method="get">`); the search works without JavaScript.

## Styles

- `global.css` (tokens, base) loads first from `BaseLayout`. Every other sheet starts with `@layer theme, base, components, utilities;` and wraps its rules in `@layer components`, so utilities always win.
- `BaseLayout` loads `base`, `controls`, `header`, `footer`, `loader`. A page or component imports the area sheets it needs (`import '@/styles/product.css'`), so each page ships only its CSS, inlined.
- Class names are the design's (`.btn.y`, `.pc`, `.sec-h`, `.rv`). Use Tailwind utilities for one-off layout the design wrote as inline styles (`flex flex-col gap-1.5`).
- Breakpoints: `md` = 900px, `lg` = 1100px (`max-md:` is the design's phone layout).

## Islands

- One island per interactive region, in `src/components/islands/`, Preact function components with the design's classes.
- Shared state is in `src/stores` (nanostores): `$cart`, `$session`, `$panel`, `$loader`. Call `boot(locale)` in an effect so the cart and session load once per page.
- Islands render on the server too. Anything that only exists in the browser (dates relative to now, storage) renders after mount (`useMounted`) with a neutral server fallback.
- Do not put `.rv` (reveal on scroll) inside an island: a re-render would drop the class the observer adds. Put it on a static wrapper in the `.astro` file.
- Long waits (sign-in, placing an order) run inside `withLoader(message, task)` so the logo-hop loader covers them.

## API layer (`src/lib/api`)

- `types.ts` is the frontend's domain model (camelCase, money in minor units, ISO dates).
- `contracts.ts` is the port, `StorefrontApi`. Add a method there first, then to both adapters.
- `mock/` is a backend in the browser: fixtures (`mock/fixtures/*.json`, text as `{ en, es }`) plus localStorage. It owns the business rules a backend would (volume tiers, recurring discount, shipping, tax).
- `http/` is the Kart adapter. Its `ROUTES` table and `adapt` mappers are the only places that know Kart's wire format.
- Errors are `ApiError` with a stable `code` (Kart's problem+json). Branch on `code`, never on message text.

## SEO

- `Seo.astro` writes the title, description, canonical, hreflang (en, es, x-default), Open Graph, Twitter card and the JSON-LD graph. One `<h1>` per page.
- Only production is indexed (`PUBLIC_INDEXABLE=true`); every other environment sends `noindex`.
- Every indexable page appears in `src/pages/sitemap.xml.ts` and has an Open Graph card in `src/pages/og/`.
- Ratings and reviews in the mock catalog are sample data: never emit them as `aggregateRating` or `review` structured data.

## Environments

| | Domain | Branch | Vercel | Koda | KPulse |
|---|---|---|---|---|---|
| Production | ipac-ecommerce.aikoders.us | `main` | production | `production` | `production` |
| Staging | ipac-ecommerce-dev.aikoders.us | `dev` | custom environment `staging` | `staging` | `staging` |
| Preview | per-branch `*.vercel.app` | any other | preview | `development` | `development` |
| Local | localhost:4321 | — | — | `local` | `development` |

Variables are listed in `.env.example`; their values live in Koda (project `ipac`, system `storefront`). Never commit a value.
