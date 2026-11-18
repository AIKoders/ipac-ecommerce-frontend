import type { APIRoute } from 'astro';
import { reportError } from '@/lib/kpulse/report';

export const prerender = false;

/**
 * POST /api/kpulse: errors caught in the browser (scripts/errors.ts), passed
 * on to KPulse with the server's key. Only from the site's own pages, small,
 * and only what an error needs, so a visitor cannot make it send anything else.
 */
const MAX_BYTES = 8_000;

const text = (value: unknown, max: number) => (typeof value === 'string' && value ? value.slice(0, max) : undefined);

export const POST: APIRoute = async ({ request }) => {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') {
    let from = '';
    try {
      from = new URL(origin).host;
    } catch {
      return new Response(null, { status: 403 });
    }
    if (from !== host) return new Response(null, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return new Response(null, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }
  const message = text(body.message, 1000) ?? 'Unknown error';
  await reportError({
    message: `Browser: ${message}`,
    error: { type: text(body.type, 100) ?? 'BrowserError', message, stack: text(body.stack, 4000) },
    path: text(body.path, 500),
    attrs: { side: 'browser', source: text(body.source, 300), user_agent: text(request.headers.get('user-agent'), 300), host },
  });
  return new Response(null, { status: 204 });
};
