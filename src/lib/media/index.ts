import type { Media } from '@/lib/api/types';
import manifest from './manifest.json';

/**
 * Local media, served from /media in the widths scripts/optimize-images.ts
 * built. The mock catalog and the brand photography use this; media coming
 * from the real API already carries its own URL and dimensions.
 */
type Entry = { width: number; height: number; widths: number[] };
const entries = manifest as Record<string, Entry>;

export type MediaGroup = 'products' | 'photos';

export function localMedia(group: MediaGroup, key: string, alt = ''): Media {
  const entry = entries[`${group}/${key}`];
  if (!entry) throw new Error(`Unknown media "${group}/${key}". Add it to src/assets/media and run \`bun run images\`.`);
  const largest = entry.widths[entry.widths.length - 1] ?? entry.width;
  const url = (width: number) => `/media/${group}/${key}-${width}.webp`;
  return {
    url: url(largest),
    width: entry.width,
    height: entry.height,
    alt,
    srcset: entry.widths.map((width) => `${url(width)} ${width}w`).join(', '),
  };
}
