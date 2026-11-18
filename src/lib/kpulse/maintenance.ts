/**
 * Maintenance mode: while KPulse has this service behind a blocking
 * maintenance window, browsers get the maintenance page (503) and API
 * callers a 503 JSON — before your code runs. Nothing to deploy when you
 * switch it on or off in KPulse (Incidents → Maintenance): the state is
 * kept in memory and refreshed every ~20 s (GET /api/v1/maintenance-mode,
 * ETag), so a request never waits on KPulse except the very first one of a
 * cold process (at most `coldStartMs`).
 *
 *   const maintenance = createMaintenance({ project: 'easysalon', component: 'api', environment: 'production' });
 *   app.use(maintenance.express());                          // Express / NestJS
 *   export const proxy = maintenance.proxy();                // Next.js 16 proxy.ts (middleware.ts: .next())
 *   app.use('*', maintenance.hono());                        // Hono / Bun
 *   export const onRequest = maintenance.astro();            // Astro src/middleware.ts
 *   const blocked = await maintenance.gate(request);         // anything with the Fetch API
 *   const state = await maintenance.check();                 // an app (React Native, a SPA): show your own screen
 *
 * Always let through: OPTIONS, the `allow` paths (health checks by default),
 * and the team — a request carrying the window's bypass token
 * (?kpulse_bypass=… once sets a cookie; API clients send x-kpulse-bypass).
 *
 * Fails open: with no answer from KPulse yet, or none for `staleMs`, nothing
 * is blocked.
 *
 * One file, no imports: a service may copy it as is
 * (curl -o src/lib/kpulse-maintenance.ts https://kpulse.aikoders.us/api/v1/sdk/maintenance.ts).
 */

export interface MaintenanceWindow {
  id: string;
  title: string;
  message: string;
  /** The message as safe HTML (KPulse renders the Markdown). */
  html: string;
  starts_at: string;
  ends_at: string;
  /** It runs until the team ends it: ends_at is their estimate. */
  until_ended: boolean;
  overdue: boolean;
  zone: string;
}

export interface MaintenanceState {
  active: boolean;
  project: { slug: string; name: string };
  component: string | null;
  environment: string;
  maintenance: MaintenanceWindow | null;
  notice: { id: string; title: string; ends_at: string } | null;
  upcoming: { id: string; title: string; starts_at: string; ends_at: string; block: boolean }[];
  bypass_sha256: string | null;
  retry_after: number;
  page_url: string;
  status_url: string | null;
  ttl: number;
  checked_at: string;
}

export interface MaintenanceOptions {
  /** KPulse's address (default https://kpulse.aikoders.us). */
  endpoint?: string;
  /** The project's slug in KPulse (`easysalon`). */
  project?: string;
  /** The component's slug (`api`, `dashboard`): only windows of the whole project, or naming it, apply. */
  component?: string;
  /** `production` (default), `staging`, `development`, `preview`… (`prod`, `stg`, `dev` work too). */
  environment?: string;
  /** A log source key (`kp_ing_…`) instead of project/component/environment: the source's own. */
  key?: string;
  /**
   * Paths that keep working (prefixes; or RegExps; or a function). Default: health checks
   * (/health, /healthz, /api/health, /livez, /readyz). Webhooks are refused on purpose — their
   * senders retry later — unless you list them.
   */
  allow?: (string | RegExp)[] | ((path: string, method: string) => boolean);
  /** Browsers get KPulse's maintenance page (default), your own HTML, or — false — the JSON like everyone. */
  page?: false | ((state: MaintenanceState, lang: 'en' | 'es') => string);
  /** How long the first request of a cold process may wait for the first answer (default 1500 ms). */
  coldStartMs?: number;
  /** How long the last answer is trusted when KPulse can't be reached (default 15 min). */
  staleMs?: number;
  /** Called when maintenance mode turns on or off (or the window changes). */
  onChange?: (state: MaintenanceState) => void;
  onError?: (error: unknown) => void;
  fetch?: typeof fetch;
}

/** A request, as the gate reads it. */
export interface GateRequest {
  method: string;
  /** Absolute, or a path with its query. */
  url: string;
  header(name: string): string | null;
}

export type Decision =
  | { kind: 'pass' }
  | { kind: 'redirect'; location: string; cookie: string }
  | { kind: 'block'; status: 503; headers: Record<string, string>; body: string };

export const BYPASS_PARAM = 'kpulse_bypass';
export const BYPASS_HEADER = 'x-kpulse-bypass';
export const MAINTENANCE_HEADER = 'x-kpulse-maintenance';
const DEFAULT_ALLOW = ['/health', '/healthz', '/api/health', '/livez', '/readyz', '/_health'];

// ── Hashing (Web Crypto) ──
// Node 20+, Bun, Deno, edge runtimes and browsers all have it. No node:crypto
// fallback: edge bundlers (Vercel's Edge Functions) refuse a file that even
// names it. Without Web Crypto no bypass token matches — closed stays closed.
const hashes = new Map<string, string>();
async function sha256(text: string): Promise<string | null> {
  const hit = hashes.get(text);
  if (hit) return hit;
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hashes.size > 200) hashes.clear();
  hashes.set(text, hex);
  return hex;
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return part.slice(i + 1).trim();
      }
    }
  }
  return null;
}

/** The language of the page: the visitor's first choice that KPulse speaks. */
export function langOf(acceptLanguage: string | null): 'en' | 'es' {
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if (tag === 'es' || tag === 'en') return tag;
  }
  return 'en';
}

/** A Node request's headers, read like a Fetch Headers. */
function nodeHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page when KPulse's own can't be fetched: plain, but it says what's going on and reloads. */
export function fallbackPage(state: MaintenanceState, lang: 'en' | 'es'): string {
  const m = state.maintenance;
  const es = lang === 'es';
  const until = m ? new Date(m.ends_at) : null;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="60"><title>${esc(m?.title ?? 'Maintenance')} · ${esc(state.project.name)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;color:#121820}main{max-width:520px}p{color:#4c5866}@media (prefers-color-scheme:dark){body{background:#0b0f14;color:#e9eef4}p{color:#a6b1bd}}</style></head>
<body><main><p>${esc(state.project.name)}</p><h1>${esc(m?.title ?? (es ? 'Mantenimiento' : 'Maintenance'))}</h1>${m?.html ?? ''}<p>${
    until && !m?.overdue ? `${es ? 'Volvemos hacia las' : 'Expected back around'} ${esc(until.toUTCString())}.` : es ? 'Volvemos enseguida.' : 'We’ll be back shortly.'
  }</p>${state.status_url ? `<p><a href="${esc(state.status_url)}">${es ? 'Página de estado' : 'Status page'}</a></p>` : ''}</main></body></html>`;
}

export class MaintenanceMode {
  readonly url: string;
  private readonly fetchFn: typeof fetch;
  private last: MaintenanceState | null = null;
  private okAt = 0;
  private nextAt = 0;
  private etag: string | null = null;
  private loading: Promise<void> | null = null;
  private pages = new Map<string, { at: number; html: string }>();
  private readonly allow: (path: string, method: string) => boolean;

  constructor(readonly opts: MaintenanceOptions = {}) {
    if (!opts.key && !opts.project) throw new Error('KPulse maintenance: give `project` (its slug in KPulse) or a source `key`.');
    const base = (opts.endpoint ?? 'https://kpulse.aikoders.us').replace(/\/+$/, '').replace(/\/api\/v1\/ingest\/logs$/, '');
    const q = new URLSearchParams();
    if (opts.project) q.set('project', opts.project);
    if (opts.component) q.set('component', opts.component);
    if (opts.environment) q.set('environment', opts.environment);
    this.url = `${base}/api/v1/maintenance-mode${q.toString() ? `?${q}` : ''}`;
    const f = opts.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) throw new Error('KPulse maintenance: no fetch in this runtime — pass `fetch`.');
    this.fetchFn = f.bind(globalThis) as typeof fetch;
    const allow = opts.allow ?? DEFAULT_ALLOW;
    this.allow =
      typeof allow === 'function'
        ? allow
        : // A path and what is under it — except "/", which is only the root (as a prefix it would open everything).
          (path) => allow.some((a) => (typeof a === 'string' ? path === a || (a !== '/' && path.startsWith(a.endsWith('/') ? a : `${a}/`)) : a.test(path)));
  }

  /** The last answer, while it can be trusted (null: open). */
  get state(): MaintenanceState | null {
    if (!this.last) return null;
    return Date.now() - this.okAt < (this.opts.staleMs ?? 15 * 60_000) ? this.last : null;
  }

  /** Is the service behind the maintenance page right now? */
  get active(): boolean {
    return !!this.state?.active;
  }

  /** Ask KPulse again if the answer is older than its ttl (in the background unless awaited). */
  refresh(force = false): Promise<void> {
    if (!force && Date.now() < this.nextAt) return Promise.resolve();
    this.loading ??= this.load().finally(() => (this.loading = null));
    return this.loading;
  }

  /** The first answer, waiting at most `ms` (a cold process). */
  async whenReady(ms = this.opts.coldStartMs ?? 1500): Promise<void> {
    if (this.okAt || this.nextAt) return;
    await Promise.race([this.refresh(true), new Promise((r) => setTimeout(r, ms))]);
  }

  /** Fresh state (for apps that show their own screen): null when KPulse can't be reached. */
  async check(): Promise<MaintenanceState | null> {
    await this.refresh(true);
    return this.state;
  }

  /** Calls `fn` now and whenever maintenance mode turns on or off; returns a function that stops. */
  watch(fn: (state: MaintenanceState | null) => void, everyMs = 30_000): () => void {
    let lastKey = '';
    let stopped = false;
    const tick = async () => {
      const s = await this.check();
      const key = s?.active ? `on:${s.maintenance?.id}:${s.maintenance?.ends_at}` : 'off';
      if (!stopped && key !== lastKey) {
        lastKey = key;
        fn(s);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), Math.max(10_000, everyMs));
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  private async load(): Promise<void> {
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.opts.key) headers.authorization = `Bearer ${this.opts.key}`;
      if (this.etag && this.last) headers['if-none-match'] = this.etag;
      const res = await this.fetchFn(this.url, { headers });
      if (res.status === 304 && this.last) {
        this.okAt = Date.now();
        this.nextAt = Date.now() + Math.max(10, this.last.ttl || 20) * 1000;
        return;
      }
      if (!res.ok) throw new Error(`KPulse maintenance: ${res.status} ${await res.text().catch(() => '')}`.trim());
      const s = (await res.json()) as MaintenanceState;
      const before = this.last;
      this.last = s;
      this.etag = res.headers.get('etag');
      this.okAt = Date.now();
      this.nextAt = Date.now() + Math.max(10, s.ttl || 20) * 1000;
      if (!s.active) this.pages.clear();
      const key = (x: MaintenanceState | null) => (x?.active ? `${x.maintenance?.id}:${x.maintenance?.ends_at}:${x.maintenance?.title}` : 'off');
      if (key(before) !== key(s)) {
        this.pages.clear();
        try {
          this.opts.onChange?.(s);
        } catch {
          /* the listener's problem */
        }
      }
    } catch (error) {
      // Keep the last answer (until it is too old to trust) and try again shortly.
      this.nextAt = Date.now() + 10_000;
      try {
        this.opts.onError?.(error);
      } catch {
        /* never throw from here */
      }
    }
  }

  /** KPulse's maintenance page for this window and language (cached; the fallback if it can't be fetched). */
  private async page(s: MaintenanceState, lang: 'en' | 'es'): Promise<string> {
    if (typeof this.opts.page === 'function') return this.opts.page(s, lang);
    const key = `${s.maintenance?.id}:${lang}`;
    const hit = this.pages.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.html;
    try {
      const res = await Promise.race([
        this.fetchFn(`${s.page_url}${s.page_url.includes('?') ? '&' : '?'}embed=1&lang=${lang}`, { headers: { accept: 'text/html' } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('KPulse maintenance page: timeout')), 2500)),
      ]);
      const html = await res.text();
      if (!html.includes('<html')) throw new Error(`KPulse maintenance page: ${res.status}`);
      this.pages.set(key, { at: Date.now(), html });
      return html;
    } catch (error) {
      try {
        this.opts.onError?.(error);
      } catch {
        /* never throw from here */
      }
      return fallbackPage(s, lang);
    }
  }

  /** What to do with a request: let it through, set the bypass cookie, or answer for the service. */
  async decide(req: GateRequest): Promise<Decision> {
    await this.whenReady();
    void this.refresh();
    const s = this.state;
    if (!s?.active || !s.maintenance) return { kind: 'pass' };
    const method = req.method.toUpperCase();
    if (method === 'OPTIONS') return { kind: 'pass' };
    let url: URL;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      url = new URL('http://localhost/');
    }
    if (this.allow(url.pathname, method)) return { kind: 'pass' };

    // The team: the window's token, from the link (once), the cookie or the header.
    if (s.bypass_sha256) {
      const given = url.searchParams.get(BYPASS_PARAM);
      if (given && (await sha256(given)) === s.bypass_sha256) {
        url.searchParams.delete(BYPASS_PARAM);
        const secure = (req.header('x-forwarded-proto') ?? url.protocol.replace(':', '')) === 'https' ? '; Secure' : '';
        const location = /^https?:\/\//i.test(req.url) ? url.href : `${url.pathname}${url.search}${url.hash}`;
        return { kind: 'redirect', location, cookie: `${BYPASS_PARAM}=${encodeURIComponent(given)}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax${secure}` };
      }
      const token = req.header(BYPASS_HEADER) ?? cookieValue(req.header('cookie'), BYPASS_PARAM);
      if (token && (await sha256(token)) === s.bypass_sha256) return { kind: 'pass' };
    }

    const m = s.maintenance;
    const common = {
      'Retry-After': String(s.retry_after || 120),
      'Cache-Control': 'no-store',
      [MAINTENANCE_HEADER]: m.id,
    };
    const wantsHtml = (method === 'GET' || method === 'HEAD') && /text\/html/i.test(req.header('accept') ?? '');
    if (wantsHtml && this.opts.page !== false) {
      const html = await this.page(s, langOf(req.header('accept-language')));
      return { kind: 'block', status: 503, headers: { ...common, 'Content-Type': 'text/html; charset=utf-8' }, body: method === 'HEAD' ? '' : html };
    }
    const origin = req.header('origin');
    const cors: Record<string, string> = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Expose-Headers': `retry-after, ${MAINTENANCE_HEADER}`, Vary: 'Origin' } : {};
    const body = JSON.stringify({
      error: 'maintenance',
      detail: m.title,
      maintenance: { id: m.id, title: m.title, message: m.message, ends_at: m.ends_at, until_ended: m.until_ended, overdue: m.overdue },
      retry_after: s.retry_after,
      status_url: s.status_url,
      page_url: s.page_url,
    });
    return { kind: 'block', status: 503, headers: { ...common, ...cors, 'Content-Type': 'application/json; charset=utf-8' }, body };
  }

  // ── Frameworks ──────────────────────────────────────────────────
  /** Fetch API: the Response to send instead (maintenance, or the bypass redirect), or null to go on. */
  async gate(req: Request): Promise<Response | null> {
    const d = await this.decide({ method: req.method, url: req.url, header: (n) => req.headers.get(n) });
    if (d.kind === 'pass') return null;
    if (d.kind === 'redirect') return new Response(null, { status: 302, headers: { Location: d.location, 'Set-Cookie': d.cookie, 'Cache-Control': 'no-store' } });
    return new Response(d.body || null, { status: d.status, headers: d.headers });
  }

  /** Wraps a Fetch handler (Bun.serve, Deno.serve, Workers, Next.js route handlers). */
  handler<Args extends unknown[]>(fn: (req: Request, ...args: Args) => Response | Promise<Response>) {
    return async (req: Request, ...args: Args): Promise<Response> => (await this.gate(req)) ?? fn(req, ...args);
  }

  /**
   * Next.js `middleware.ts`: `export const middleware = maintenance.next()` — or, inside your own,
   * `const blocked = await maintenance.gate(request); if (blocked) return blocked;`.
   */
  next() {
    return async (req: Request): Promise<Response | undefined> => (await this.gate(req)) ?? undefined;
  }

  /** Next.js 16 `proxy.ts`: `export const proxy = maintenance.proxy()` (the same as next()). */
  proxy() {
    return this.next();
  }

  /** Hono: `app.use('*', maintenance.hono())`. */
  hono() {
    return async (c: { req: { raw: Request } }, next: () => Promise<void>): Promise<Response | void> => {
      const blocked = await this.gate(c.req.raw);
      if (blocked) return blocked;
      await next();
    };
  }

  /** Astro `src/middleware.ts`: `export const onRequest = maintenance.astro()` (or inside `sequence(…)`). */
  astro() {
    return async (context: { request: Request }, next: () => Promise<Response>): Promise<Response> => (await this.gate(context.request)) ?? next();
  }

  /** Express and NestJS (Express adapter): `app.use(maintenance.express())` before the routes. */
  express() {
    return (
      req: { method?: string; originalUrl?: string; url?: string; headers: Record<string, string | string[] | undefined>; protocol?: string; get?: (n: string) => string | undefined },
      res: { statusCode: number; setHeader(n: string, v: string): unknown; end(body?: string): unknown },
      next: (err?: unknown) => void,
    ): void => {
      this.decide({ method: req.method ?? 'GET', url: req.originalUrl ?? req.url ?? '/', header: (n) => nodeHeader(req.headers, n) }).then(
        (d) => {
          if (d.kind === 'pass') return next();
          if (d.kind === 'redirect') {
            res.statusCode = 302;
            res.setHeader('Location', d.location);
            res.setHeader('Set-Cookie', d.cookie);
            res.setHeader('Cache-Control', 'no-store');
            res.end();
            return;
          }
          res.statusCode = d.status;
          for (const [k, v] of Object.entries(d.headers)) res.setHeader(k, v);
          res.end(d.body);
        },
        () => next(),
      );
    };
  }
}

/** Maintenance mode for one service. Create it once per process. */
export function createMaintenance(options: MaintenanceOptions): MaintenanceMode {
  return new MaintenanceMode(options);
}

/** Did an API answer because the service is in maintenance mode? (Apps: show your maintenance screen.) */
export function isMaintenanceResponse(res: { status: number; headers: { get(name: string): string | null } }): boolean {
  return res.status === 503 && !!res.headers.get(MAINTENANCE_HEADER);
}
