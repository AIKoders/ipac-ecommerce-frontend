import { translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import type { OrderLine } from '@/lib/api/types';
import { Img } from '../shared';

/** Pieces the account's sections share: what an order or a schedule contains. */

const lineKey = (line: OrderLine) => `${line.variantId}:${line.intervalWeeks ?? 'once'}`;

/** "1 item" / "4 items". */
export function itemCountLabel(locale: Locale, count: number): string {
  const t = translator(common, locale);
  return `${count} ${t(count === 1 ? 'item' : 'items')}`;
}

/** The row of product pictures on a dashboard panel. They are the only mention of the products there, so they carry their names. */
export function Thumbs({ lines }: { lines: OrderLine[] }) {
  return (
    <div class="thumbs">
      {lines.map((line) => (
        <Img key={lineKey(line)} media={line.image} alt={line.title} sizes="68px" />
      ))}
    </div>
  );
}

/** The products of an order or a schedule, each with its quantity. */
export function LineItems({ locale, lines }: { locale: Locale; lines: OrderLine[] }) {
  const t = translator(common, locale);
  return (
    <div class="ord-i">
      {lines.map((line) => (
        <div class="mini" key={lineKey(line)}>
          <Img media={line.image} alt="" sizes="48px" />
          <span>
            {line.title}
            <br />
            <span class="fine">{t('qty', { qty: line.quantity })}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
