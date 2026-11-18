import { KPULSE_KEY, KPULSE_URL } from 'astro:env/server';
import { site } from '@/config/site';
import { KPULSE_ENVIRONMENT } from './gate';

/**
 * Errors to KPulse, as app lines of the storefront (its requests arrive from
 * the Vercel log drain, so they are not sent from here). Never throws and
 * never waits long: three seconds, then the report is dropped, because a
 * failing report must not make a failing page slower. Does nothing without
 * `KPULSE_KEY`. Server-only.
 */
export interface ErrorReport {
  message: string;
  error?: { type?: string; message?: string; stack?: string };
  method?: string;
  path?: string;
  route?: string;
  attrs?: Record<string, unknown>;
}

const clip = (text: string | undefined, max: number) => (text && text.length > max ? `${text.slice(0, max)}…` : text);

export async function reportError(report: ErrorReport): Promise<void> {
  if (!KPULSE_KEY) return;
  const event = {
    ts: new Date().toISOString(),
    level: 'error',
    kind: 'app',
    service: site.kpulse.service,
    environment: KPULSE_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    message: clip(report.message, 2000),
    error: report.error ? { type: report.error.type, message: clip(report.error.message, 2000), stack: clip(report.error.stack, 16000) } : undefined,
    method: report.method,
    path: report.path,
    route: report.route,
    attrs: report.attrs,
  };
  try {
    await fetch(`${KPULSE_URL}/api/v1/ingest/logs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KPULSE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // KPulse unreachable: the error was the page's, not ours to make worse.
  }
}
