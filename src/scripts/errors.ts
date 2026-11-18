/**
 * Uncaught errors and rejected promises in the browser, reported to KPulse
 * through the site's own /api/kpulse (which holds the key). Fire and forget,
 * and at most a few per page: a loop of errors must not become a loop of
 * requests.
 */
const LIMIT = 5;
let sent = 0;

/** Browser noise with nothing to act on: a view transition cut short by the next navigation, an aborted fetch. */
const IGNORED = (error: unknown) => error instanceof DOMException && (error.name === 'AbortError' || (error.name === 'InvalidStateError' && /transition/i.test(error.message)));

function report(error: unknown, source?: string): void {
  if (sent >= LIMIT || IGNORED(error)) return;
  sent += 1;
  try {
    const cause = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const body = JSON.stringify({
      type: cause.name,
      message: String(cause.message || 'Unknown error').slice(0, 1000),
      stack: String(cause.stack || '').slice(0, 4000),
      path: location.pathname + location.search,
      source,
    });
    const queued = navigator.sendBeacon?.('/api/kpulse', new Blob([body], { type: 'application/json' }));
    if (!queued) void fetch('/api/kpulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    // Reporting never becomes a second error.
  }
}

if (import.meta.env.PROD) {
  window.addEventListener('error', (event) => {
    // Errors of cross-origin scripts arrive as "Script error." with nothing to act on.
    if (event.error) report(event.error, event.filename);
  });
  window.addEventListener('unhandledrejection', (event) => report(event.reason, 'unhandledrejection'));
}
