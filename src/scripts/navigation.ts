import { $loader } from '@/stores/ui';

/**
 * Covers a slow page load with the loader. Following a link or submitting a
 * search starts a short timer; if the next page has not taken over by then,
 * the logo hop is shown until it does. Fast navigations (the usual case, pages
 * are prefetched) never see it.
 */
const DELAY_MS = 220;
const body = document.body.dataset;
let timer: number | undefined;

function schedule(url: URL): void {
  window.clearTimeout(timer);
  const message = (/\/products\//.test(url.pathname) ? body.loadingProduct : body.loading) ?? '';
  timer = window.setTimeout(() => $loader.set(message), DELAY_MS);
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!link || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href, window.location.href);
  const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
  if (url.origin !== window.location.origin || samePage) return;
  schedule(url);
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (event.defaultPrevented || !(form instanceof HTMLFormElement) || form.method !== 'get') return;
  schedule(new URL(form.action, window.location.href));
});

// A page restored from the back/forward cache must not come back with the veil up.
window.addEventListener('pageshow', (event) => {
  window.clearTimeout(timer);
  if (event.persisted) $loader.set(null);
});
