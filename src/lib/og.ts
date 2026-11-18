import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { DOT, LETTERS, LOGO_VIEWBOX, STEM_PATH, STEM_SCALE } from '@/components/ui/logo-paths';
import { env } from '@/config/env';
import { locales, translator, type Locale } from '@/i18n';
import { about } from '@/i18n/ns/about';
import { blog } from '@/i18n/ns/blog';
import { common } from '@/i18n/ns/common';
import { contact } from '@/i18n/ns/contact';
import { home } from '@/i18n/ns/home';
import { seo } from '@/i18n/ns/seo';
import { getApi } from '@/lib/api';
import { formatMoney } from '@/lib/format';

/**
 * Open Graph cards, 1200 × 630, drawn at build time: the page's headline on
 * the brand navy with the product (or the ipac box) in the hero's green light.
 * One card per indexable page and locale, served from /og/<locale>/<key>.jpg.
 */
export interface OgCard {
  locale: Locale;
  /** Path under /og/<locale>/, without extension: `home`, `products/packing-tape`. */
  key: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Site-relative or absolute URL of the picture on the right. */
  image: string;
}

const COLORS = { navy: '#1d2d50', navyDeep: '#16233f', green: '#6dab3c', yellow: '#efee7c', white: '#ffffff', mist: '#d5dbea', haze: '#c9d0e0' };
const WIDTH = 1200;
const HEIGHT = 630;
const BOX = '/media/products/box-brand-960.webp';

/** Every card of the site, from the same API the pages read. */
export async function allCards(): Promise<OgCard[]> {
  const cards: OgCard[] = [];
  for (const locale of locales) {
    const api = getApi(locale);
    const [categories, products, posts] = await Promise.all([api.catalog.listCategories(), api.catalog.listProducts({ limit: 200 }), api.content.listPosts()]);
    const th = translator(home, locale);
    const tc = translator(common, locale);
    const ts = translator(seo, locale);
    const tb = translator(blog, locale);
    cards.push(
      { locale, key: 'home', eyebrow: th('heroEyebrow'), title: `${th('heroTitle')} ${th('heroTitleEm')}.`, image: BOX },
      { locale, key: 'shop', eyebrow: tc('shop'), title: tc('allSupplies'), subtitle: ts('siteTagline'), image: BOX },
      { locale, key: 'about', eyebrow: translator(about, locale)('eyebrow'), title: translator(about, locale)('title'), image: BOX },
      { locale, key: 'contact', eyebrow: tc('contact'), title: translator(contact, locale)('title'), image: BOX },
      { locale, key: 'blog', eyebrow: tb('eyebrow'), title: tb('title'), image: BOX },
      ...categories.map((category) => ({ locale, key: `shop/${category.handle}`, eyebrow: tc('shop'), title: category.name, subtitle: category.description, image: category.image.url })),
      ...products.items.map((product) => ({
        locale,
        key: `products/${product.handle}`,
        eyebrow: product.category.name,
        title: product.title,
        subtitle: `${product.unitLabel} ${tc('fromDot')} ${formatMoney(product.bulkPrice, locale)}`,
        image: product.image.url,
      })),
      ...posts.map((post) => ({ locale, key: `blog/${post.slug}`, eyebrow: `${post.tag} · ${tb('minRead', { minutes: post.readMinutes })}`, title: post.title, image: post.image.url })),
    );
  }
  return cards;
}

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, props: Record<string, unknown> = {}): Node => ({ type, props: { style, children, ...props } });

const LOGO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><g transform="scale(${STEM_SCALE})"><circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${COLORS.green}"/><path d="${STEM_PATH}" fill="${COLORS.yellow}"/></g><path d="${LETTERS}" fill="${COLORS.white}"/></svg>`,
).toString('base64')}`;

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[]> | undefined;

function loadFonts() {
  const file = (pkg: string, name: string) => readFile(join(process.cwd(), 'node_modules', pkg, 'files', name));
  fonts ??= Promise.all([file('@fontsource/space-grotesk', 'space-grotesk-latin-700-normal.woff'), file('@fontsource/inter', 'inter-latin-500-normal.woff')]).then(([display, text]) => [
    { name: 'Space Grotesk', data: display, weight: 700 as const, style: 'normal' as const },
    { name: 'Inter', data: text, weight: 500 as const, style: 'normal' as const },
  ]);
  return fonts;
}

const pictures = new Map<string, Promise<string>>();

/** The picture as a PNG data URI (satori does not read WebP). */
function loadPicture(url: string): Promise<string> {
  let picture = pictures.get(url);
  if (!picture) {
    const source = url.startsWith('/') ? readFile(join(process.cwd(), 'public', url)) : fetch(url).then(async (response) => Buffer.from(await response.arrayBuffer()));
    picture = source.then((buffer) => sharp(buffer).resize(520, 520, { fit: 'inside' }).png().toBuffer()).then((png) => `data:image/png;base64,${png.toString('base64')}`);
    pictures.set(url, picture);
  }
  return picture;
}

export async function renderCard(card: OgCard): Promise<Buffer> {
  const [fontData, picture] = await Promise.all([loadFonts(), loadPicture(card.image)]);
  const titleSize = card.title.length > 62 ? 46 : card.title.length > 40 ? 54 : 66;
  const host = new URL(env.siteUrl).host;

  const tree = el('div', { width: WIDTH, height: HEIGHT, display: 'flex', position: 'relative', backgroundColor: COLORS.navy, fontFamily: 'Inter', color: COLORS.white }, [
    el('div', { position: 'absolute', left: 620, top: -60, width: 750, height: 750, display: 'flex', backgroundImage: `radial-gradient(circle, rgba(134,204,78,0.62) 0%, rgba(109,171,60,0.28) 38%, rgba(109,171,60,0) 68%)` }),
    el('div', { position: 'absolute', left: 0, top: HEIGHT - 14, width: WIDTH, height: 14, display: 'flex', backgroundColor: COLORS.yellow }),
    el('div', { position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 690, height: HEIGHT, padding: '64px 0 72px 72px' }, [
      el('img', { width: 157, height: 90 }, undefined, { src: LOGO, width: 157, height: 90 }),
      el('div', { display: 'flex', flexDirection: 'column' }, [
        el('div', { display: 'flex', alignItems: 'center', fontSize: 21, letterSpacing: 3, textTransform: 'uppercase', color: COLORS.yellow, marginBottom: 20 }, [
          el('div', { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.green, marginRight: 14, display: 'flex' }),
          card.eyebrow,
        ]),
        el('div', { display: 'flex', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: titleSize, lineHeight: 1.05, letterSpacing: -1.6 }, card.title),
        card.subtitle ? el('div', { display: 'flex', fontSize: 27, lineHeight: 1.35, color: COLORS.mist, marginTop: 20 }, card.subtitle.length > 96 ? `${card.subtitle.slice(0, 94).trimEnd()}…` : card.subtitle) : null,
      ]),
      el('div', { display: 'flex', fontSize: 21, color: COLORS.haze }, host),
    ]),
    el('div', { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 510, height: HEIGHT - 14 }, [el('img', { width: 430, height: 430, objectFit: 'contain' }, undefined, { src: picture, width: 430, height: 430 })]),
  ]);

  const svg = await satori(tree as never, { width: WIDTH, height: HEIGHT, fonts: fontData });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
  // JPEG keeps a card around 60 KB; the same picture as PNG is five times that.
  return sharp(png).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}
