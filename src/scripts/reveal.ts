/**
 * Reveal on scroll: elements with `.rv` rise into place the first time they
 * enter the viewport. They are only hidden when scripting is on (`html.js`,
 * set inline in <head>), so the page is complete without JavaScript.
 */
const targets = document.querySelectorAll<HTMLElement>('.rv');

if (targets.length) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    for (const target of targets) observer.observe(target);
  } else {
    for (const target of targets) target.classList.add('in');
  }
}
