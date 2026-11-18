/**
 * Builds the responsive image variants the storefront serves from /media.
 *
 * Sources live in src/assets/media (the design's originals). Each one is
 * resized to the widths below and written to public/media, and the manifest
 * the <img srcset> helper reads is regenerated. Run it after adding or
 * replacing a source image: `bun run images`.
 *
 * In production the catalog images come from the API's media URLs; this
 * pipeline only feeds the mock catalog and the static brand photography.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src/assets/media');
const OUT = join(ROOT, 'public/media');
const MANIFEST = join(ROOT, 'src/lib/media/manifest.json');

const GROUPS: Record<string, { widths: number[]; quality: number }> = {
  products: { widths: [160, 320, 480, 720, 960], quality: 80 },
  photos: { widths: [480, 800, 1200, 1600], quality: 74 },
};

type Entry = { width: number; height: number; widths: number[] };
const manifest: Record<string, Entry> = {};

for (const [group, { widths, quality }] of Object.entries(GROUPS)) {
  const dir = join(SRC, group);
  const outDir = join(OUT, group);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const file of (await readdir(dir)).filter((f) => extname(f) === '.webp').sort()) {
    const key = basename(file, '.webp');
    const image = sharp(join(dir, file));
    const meta = await image.metadata();
    const sourceWidth = meta.width ?? 0;
    const sourceHeight = meta.height ?? 0;
    const made = widths.filter((w) => w <= sourceWidth);
    if (!made.length) made.push(sourceWidth);
    for (const w of made) {
      await image.clone().resize({ width: w }).webp({ quality, effort: 6, alphaQuality: 90 }).toFile(join(outDir, `${key}-${w}.webp`));
    }
    manifest[`${group}/${key}`] = { width: sourceWidth, height: sourceHeight, widths: made };
  }
}

await mkdir(join(ROOT, 'src/lib/media'), { recursive: true });
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`media: ${Object.keys(manifest).length} sources → ${Object.values(manifest).reduce((n, e) => n + e.widths.length, 0)} files`);
