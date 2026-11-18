import { atom } from 'nanostores';

/**
 * The header's panels. Only one is open at a time: the mega menu and the
 * mobile menu are static markup toggled by scripts/header.ts, the cart and
 * account popovers are rendered by the HeaderActions island.
 */
export type Panel = 'mega' | 'cart' | 'account' | 'mobile';
export const $panel = atom<Panel | null>(null);

export const togglePanel = (panel: Panel): void => $panel.set($panel.get() === panel ? null : panel);
export const closePanels = (): void => $panel.set(null);

/**
 * The full-page loader. Holds the message to show while a real wait is in
 * flight (signing in, placing an order), or null when hidden. The overlay
 * itself is static markup in the layout, driven by scripts/loader.ts.
 */
export const $loader = atom<string | null>(null);

/** Runs `task` behind the loader, for at least long enough that the logo hop does not flash. */
export async function withLoader<T>(message: string, task: () => Promise<T>, minimumMs = 700): Promise<T> {
  $loader.set(message);
  const started = Date.now();
  try {
    return await task();
  } finally {
    const remaining = minimumMs - (Date.now() - started);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    $loader.set(null);
  }
}
