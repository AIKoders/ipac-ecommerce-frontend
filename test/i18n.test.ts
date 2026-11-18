import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localizePath, splitLocale, translator } from '@/i18n';
import { cart } from '@/i18n/ns/cart';

const LOCALES = join(import.meta.dir, '../src/i18n/locales');
const read = (locale: string, file: string) => JSON.parse(readFileSync(join(LOCALES, locale, file), 'utf8')) as Record<string, string>;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('dictionaries', () => {
  const files = readdirSync(join(LOCALES, 'en'));

  test('every namespace exists in both languages', () => {
    expect(readdirSync(join(LOCALES, 'es')).sort()).toEqual([...files].sort());
  });

  for (const file of files) {
    test(`${file}: same keys, same placeholders, nothing empty`, () => {
      const en = read('en', file);
      const es = read('es', file);
      expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(en[key]?.trim(), `en ${key}`).toBeTruthy();
        expect(es[key]?.trim(), `es ${key}`).toBeTruthy();
        expect(placeholders(es[key] ?? ''), key).toEqual(placeholders(en[key] ?? ''));
      }
    });
  }
});

describe('helpers', () => {
  test('translator fills placeholders and follows the locale', () => {
    expect(translator(cart, 'en')('freeRemaining', { amount: '$12.00' })).toBe('Add $12.00 more for free local delivery');
    expect(translator(cart, 'es')('freeRemaining', { amount: '$12.00' })).toContain('$12.00');
  });

  test('the default locale has no prefix', () => {
    expect(localizePath('en', '/shop')).toBe('/shop');
    expect(localizePath('es', '/shop')).toBe('/es/shop');
    expect(localizePath('es', '/')).toBe('/es');
  });

  test('a pathname splits into locale and path', () => {
    expect(splitLocale('/es/products/packing-tape')).toEqual({ locale: 'es', path: '/products/packing-tape' });
    expect(splitLocale('/es')).toEqual({ locale: 'es', path: '/' });
    expect(splitLocale('/shop/')).toEqual({ locale: 'en', path: '/shop' });
    expect(splitLocale('/')).toEqual({ locale: 'en', path: '/' });
  });
});
