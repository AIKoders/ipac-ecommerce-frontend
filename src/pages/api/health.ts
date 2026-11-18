import type { APIRoute } from 'astro';
import { env } from '@/config/env';
import { site } from '@/config/site';
import { KPULSE_ENVIRONMENT } from '@/lib/kpulse/gate';

export const prerender = false;

/**
 * For KPulse's monitor: the storefront's functions answer, and, once it talks
 * to a real backend, whether that backend does. The pages themselves are
 * static, so a backend outage degrades the store (no cart, no checkout)
 * rather than taking it down: "degraded" still answers 200.
 */
async function backend(): Promise<{ mode: string; ok: boolean; ms?: number }> {
  if (env.apiMode !== 'http' || !env.apiUrl) return { mode: 'mock', ok: true };
  const started = performance.now();
  try {
    const response = await fetch(`${new URL(env.apiUrl).origin}/health`, { signal: AbortSignal.timeout(2500) });
    return { mode: 'http', ok: response.ok, ms: Math.round(performance.now() - started) };
  } catch {
    return { mode: 'http', ok: false, ms: Math.round(performance.now() - started) };
  }
}

export const GET: APIRoute = async () => {
  const api = await backend();
  const body = {
    status: api.ok ? 'ok' : 'degraded',
    service: site.kpulse.service,
    environment: KPULSE_ENVIRONMENT,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    checks: { api },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
