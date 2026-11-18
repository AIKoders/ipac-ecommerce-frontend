import type { Locale } from '@/i18n';
import { loadCart } from './cart';
import { loadSession } from './session';

/**
 * Loads the shopper's cart and session once per page, whichever island mounts
 * first, and keeps them fresh when the page comes back from the back/forward
 * cache or another tab changes them.
 */
let booted = false;

export function boot(locale: Locale): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  const refresh = () => {
    void loadCart(locale);
    void loadSession(locale);
  };
  refresh();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refresh();
  });
  window.addEventListener('storage', refresh);
}
