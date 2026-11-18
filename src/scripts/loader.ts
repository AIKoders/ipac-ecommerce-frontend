import { $loader } from '@/stores/ui';

/**
 * Drives the page loader. While `$loader` holds a message the veil is shown
 * and the logo animates: the dot of the "i" crouches, hops across p, a and c
 * (each letter dips as it lands) and bounces home, on a 4.2 second loop.
 */
const root = document.querySelector<HTMLElement>('[data-loader]');
const text = root?.querySelector<HTMLElement>('[data-loader-text]');
const part = (name: string) => root?.querySelector<SVGGElement>(`[data-ld="${name}"]`) ?? null;
const dot = part('dot');
const stem = part('stem');
const letters = { p: part('p'), a: part('a'), c: part('c') };

const R = 18.42;
const LANDING = { p: { cx: 67.14, top: 42.37 }, a: { cx: 121.33, top: 42.37 }, c: { cx: 175.59, top: 41.92 } } as const;
type Spot = keyof typeof LANDING | 'home';
/** start, end, from, to, apex height of each jump. */
const JUMPS: [number, number, Spot, Spot, number][] = [
  [1.15, 1.85, 'home', 'p', -30],
  [1.93, 2.43, 'p', 'a', 2],
  [2.51, 3.01, 'a', 'c', 2],
  [3.3, 4.25, 'c', 'home', -38],
  [4.33, 4.66, 'home', 'home', 4.4],
  [4.72, 4.92, 'home', 'home', 13.2],
];
const CROUCH: Record<number, number> = { 0: 0.28, 3: 0.27 };
const LANDS = { p: 1.85, a: 2.43, c: 3.01 } as const;

const spot = (name: Spot): [number, number] => (name === 'home' ? [R, R] : [LANDING[name].cx, LANDING[name].top - R]);
const clamp01 = (x: number, a: number, b: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function frame(elapsed: number): void {
  if (!dot || !stem) return;
  const t = 0.86 + ((elapsed * 1.5) % 4.2);
  const dip = (landedAt: number) => {
    const u = t - landedAt;
    return u < 0 || u > 1.4 ? 0 : Math.exp(-7 * u) * Math.sin(16 * u);
  };
  const dips = { p: 0, a: 0, c: 0 };
  for (const key of ['p', 'a', 'c'] as const) {
    dips[key] = 3.4 * dip(LANDS[key]);
    letters[key]?.setAttribute('transform', `translate(0 ${dips[key].toFixed(3)})`);
  }

  let squash = 0;
  const sinceHome = t - 4.25;
  if (sinceHome >= 0 && sinceHome < 1.5) squash = 0.09 * Math.exp(-5 * sinceHome) * Math.cos(14 * sinceHome);
  for (const landedAt of [4.66, 4.92]) {
    const u = t - landedAt;
    if (u >= 0 && u < 1) squash += 0.03 * Math.exp(-7 * u) * Math.cos(16 * u);
  }
  stem.setAttribute('transform', `translate(0 91.45) scale(1 ${(1 - squash).toFixed(4)}) translate(0 -91.45)`);

  let x: number;
  let y: number;
  let sx = 1;
  let sy = 1;
  const jump = JUMPS.find(([start, end]) => t >= start && t < end);
  if (jump) {
    const [start, end, from, to, apex] = jump;
    const u = (t - start) / (end - start);
    const a = spot(from);
    const b = spot(to);
    const lift = apex - (a[1] + b[1]) / 2;
    x = lerp(a[0], b[0], u);
    y = lerp(a[1], b[1], u) + lift * 4 * u * (1 - u);
    const velocity = b[1] - a[1] + lift * 4 * (1 - 2 * u);
    const peak = Math.max(Math.abs(b[1] - a[1] + lift * 4), Math.abs(b[1] - a[1] - lift * 4), 1);
    const stretch = Math.abs(velocity) / peak;
    sy = 1 + 0.16 * stretch;
    sx = 1 - 0.08 * stretch;
  } else {
    const last = [...JUMPS].reverse().find(([, end]) => end <= t);
    const where: Spot = last ? last[3] : 'home';
    const position = spot(where);
    let squeeze = 0;
    x = position[0];
    y = position[1] + (where === 'home' ? 0 : dips[where]);
    if (last) {
      const u = t - last[1];
      if (u < 0.22) squeeze = Math.sin((Math.PI * u) / 0.22) * (last === JUMPS[3] ? 1.2 : 1);
    }
    for (const index of [0, 3]) {
      const next = JUMPS[index];
      const length = CROUCH[index];
      if (next && length && t >= next[0] - length && t < next[0]) squeeze = Math.max(squeeze, easeInOut(clamp01(t, next[0] - length, next[0] - 0.02)));
    }
    sy = 1 - 0.2 * squeeze;
    sx = 1 + 0.13 * squeeze;
  }
  dot.setAttribute('transform', `translate(${x.toFixed(3)} ${(y + R).toFixed(3)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)})`);
}

let raf = 0;
let startedAt = 0;
const still = window.matchMedia('(prefers-reduced-motion: reduce)');

function tick(now: number): void {
  frame((now - startedAt) / 1000);
  raf = requestAnimationFrame(tick);
}

$loader.subscribe((message) => {
  if (!root) return;
  root.classList.toggle('on', message !== null);
  if (message !== null && text) text.textContent = message;
  cancelAnimationFrame(raf);
  if (message !== null && !still.matches) {
    startedAt = performance.now();
    raf = requestAnimationFrame(tick);
  }
});
