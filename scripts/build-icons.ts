/**
 * Builds the favicon and app icons from the ipac mark (the "i": a green dot
 * over a yellow stem) on the brand navy. Run after changing the mark:
 * `bun scripts/build-icons.ts`. Outputs go to public/ and are committed.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { DOT, STEM_PATH } from '../src/components/ui/logo-paths';

const PUBLIC = join(new URL('..', import.meta.url).pathname, 'public');
const NAVY = '#1d2d50';
const GREEN = '#6dab3c';
const YELLOW = '#efee7c';
/** The mark's own box: 56 wide (the dot), 139 tall (dot plus stem). */
const MARK = { width: 56, height: 139 };

function icon({ radius, scale }: { radius: number; scale: number }): string {
  const x = (512 - MARK.width * scale) / 2;
  const y = (512 - MARK.height * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${NAVY}"/><g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})"><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${GREEN}"/><path d="${STEM_PATH}" fill="${YELLOW}"/></g></svg>`;
}

const rounded = icon({ radius: 112, scale: 2.3 });
/** Maskable icons are cropped by the OS: full-bleed background, mark inside the central 80%. */
const maskable = icon({ radius: 0, scale: 1.85 });

const png = (svg: string, size: number) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** A single-image .ico: the 6-byte header, one 16-byte directory entry, then the PNG itself. */
function ico(image: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(image.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, image]);
}

await writeFile(join(PUBLIC, 'favicon.svg'), rounded);
await writeFile(join(PUBLIC, 'favicon.ico'), ico(await png(rounded, 32), 32));
await writeFile(join(PUBLIC, 'apple-touch-icon.png'), await png(icon({ radius: 0, scale: 2.1 }), 180));
await writeFile(join(PUBLIC, 'icon-192.png'), await png(rounded, 192));
await writeFile(join(PUBLIC, 'icon-512.png'), await png(rounded, 512));
await writeFile(join(PUBLIC, 'icon-maskable-512.png'), await png(maskable, 512));
console.log('icons: favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png');
