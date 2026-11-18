import { defineMiddleware } from 'astro:middleware';
import { maintenance } from '@/lib/kpulse/gate';
import { reportError } from '@/lib/kpulse/report';

/**
 * On-demand routes only (prerendered pages never reach a server): a KPulse
 * maintenance window closes them before they run, and an unhandled error is
 * reported to KPulse before it surfaces.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();
  const blocked = await maintenance.gate(context.request);
  if (blocked) return blocked;
  try {
    return await next();
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    await reportError({
      message: cause.message,
      error: { type: cause.name, message: cause.message, stack: cause.stack },
      method: context.request.method,
      path: context.url.pathname,
      route: context.routePattern,
    });
    throw error;
  }
});
