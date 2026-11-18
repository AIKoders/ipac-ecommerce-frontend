/**
 * The hero intro. It plays from CSS as the page renders (see styles/hero.css);
 * this script only settles it afterwards and powers "Replay intro", which
 * always runs the full cut.
 */
const hero = document.querySelector<HTMLElement>('[data-hero]');
const replay = hero?.querySelector<HTMLButtonElement>('[data-hero-replay]');
const INTRO_MS = 6600;

if (hero && replay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let timer = window.setTimeout(() => hero.classList.remove('intro'), INTRO_MS);
  replay.hidden = false;
  replay.addEventListener('click', () => {
    window.clearTimeout(timer);
    hero.classList.remove('intro', 'full');
    // Reading layout flushes the removal, so adding the classes back restarts every animation.
    void hero.offsetWidth;
    hero.classList.add('intro', 'full');
    timer = window.setTimeout(() => hero.classList.remove('intro', 'full'), INTRO_MS);
  });
}
