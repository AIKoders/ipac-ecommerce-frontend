import { useEffect, useState } from 'preact/hooks';
import { translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import type { Media, Totals } from '@/lib/api/types';
import { formatMoney } from '@/lib/format';

/**
 * Small pieces every island uses. Islands render the design's classes from
 * src/styles; nothing here carries its own styling.
 */

export function Img({ media, sizes, alt, lazy = true, class: className }: { media: Media; sizes: string; alt?: string; lazy?: boolean; class?: string }) {
  return (
    <img
      src={media.url}
      srcset={media.srcset}
      sizes={media.srcset ? sizes : undefined}
      width={media.width}
      height={media.height}
      alt={alt ?? media.alt}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      class={className}
    />
  );
}

export function Stepper({ locale, quantity, onChange, min = 0, full = false }: { locale: Locale; quantity: number; onChange: (quantity: number) => void; min?: number; full?: boolean }) {
  const t = translator(common, locale);
  return (
    <div class={full ? 'step full' : 'step'}>
      <button type="button" onClick={() => onChange(Math.max(min, quantity - 1))} aria-label={t('decreaseQty')}>
        −
      </button>
      <output aria-live="polite">{quantity}</output>
      <button type="button" onClick={() => onChange(quantity + 1)} aria-label={t('increaseQty')}>
        +
      </button>
    </div>
  );
}

/** Five stars with the first `rating` of them filled. Decorative: the number is always shown next to it. */
export function Stars({ rating, size }: { rating: number; size?: number }) {
  return (
    <span class="stars" aria-hidden="true" style={size ? { fontSize: `${size}px` } : undefined}>
      ★★★★★<i style={{ width: `${(rating / 5) * 100}%` }}>★★★★★</i>
    </span>
  );
}

export function TotalsRows({ locale, totals, itemCount }: { locale: Locale; totals: Totals; itemCount?: number }) {
  const t = translator(common, locale);
  const money = (key: keyof Totals) => formatMoney(totals[key], locale);
  return (
    <>
      <div class="sp">
        <span>{itemCount === undefined ? t('subtotal') : `${t('subtotal')} · ${itemCount} ${t(itemCount === 1 ? 'item' : 'items')}`}</span>
        <b>{money('subtotal')}</b>
      </div>
      <div class="sp">
        <span>{t('delivery')}</span>
        <b>{totals.shipping.amount ? money('shipping') : t('free')}</b>
      </div>
      <div class="sp">
        <span>{t('estimatedTax')}</span>
        <b>{money('tax')}</b>
      </div>
      <div class="sp tot">
        <span>{t('total')}</span>
        <span>{money('total')}</span>
      </div>
    </>
  );
}

/** "2 weeks" / "4 semanas", from the interval the API speaks in. */
export function intervalLabel(locale: Locale, weeks: number): string {
  const t = translator(common, locale);
  if (weeks === 2) return t('weeks2');
  if (weeks === 4) return t('weeks4');
  if (weeks === 8) return t('weeks8');
  return locale === 'es' ? `${weeks} semanas` : `${weeks} weeks`;
}

/** False on the server and during hydration, true after: for content that only exists in the browser (dates, storage). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
