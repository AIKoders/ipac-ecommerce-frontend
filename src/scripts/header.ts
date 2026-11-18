import { $panel, closePanels, togglePanel, type Panel } from '@/stores/ui';

/**
 * The header's static panels (mega menu, mobile menu). The cart and account
 * popovers belong to the HeaderActions island; all four share `$panel`, so
 * opening one closes the others. A panel closes on Escape, on a click outside
 * the header, and when a link inside it is followed.
 */
const header = document.querySelector<HTMLElement>('[data-header]');

if (header) {
  const panels = [...header.querySelectorAll<HTMLElement>('[data-panel]')];
  const toggles = [...header.querySelectorAll<HTMLElement>('[data-panel-toggle]')];

  for (const toggle of toggles) {
    toggle.addEventListener('click', () => togglePanel(toggle.dataset.panelToggle as Panel));
  }

  $panel.subscribe((open) => {
    for (const panel of panels) panel.hidden = panel.dataset.panel !== open;
    for (const toggle of toggles) {
      const expanded = toggle.dataset.panelToggle === open;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.classList.toggle('on', expanded || toggle.dataset.active !== undefined);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !$panel.get()) return;
    const opener = header.querySelector<HTMLElement>(`[data-panel-toggle="${$panel.get()}"]`);
    closePanels();
    opener?.focus();
  });

  document.addEventListener('pointerdown', (event) => {
    if ($panel.get() && event.target instanceof Node && !header.contains(event.target)) closePanels();
  });

  header.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-panel] a')) closePanels();
  });

  // Coming back through the back/forward cache must not show a menu left open.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) closePanels();
  });
}
