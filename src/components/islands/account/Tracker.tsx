import { translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import type { FulfillmentStatus } from '@/lib/api/types';

const STEPS = ['statusScheduled', 'statusPacked', 'statusOutForDelivery', 'statusDelivered'] as const;

/** Index of the step in progress; a delivered order is past the last one. */
const CURRENT: Record<FulfillmentStatus, number> = { pending: 0, in_progress: 1, out_for_delivery: 2, delivered: STEPS.length };

/** The four-step delivery tracker: on navy by default, `light` on a white panel. */
export function Tracker({ locale, status, light = false }: { locale: Locale; status: FulfillmentStatus; light?: boolean }) {
  const t = translator(common, locale);
  const current = CURRENT[status];
  return (
    <ol class={light ? 'trk tl' : 'trk'}>
      {STEPS.map((key, index) => (
        <li key={key} class={index < current ? 'done' : index === current ? 'now' : undefined} aria-current={index === current ? 'step' : undefined}>
          {t(key)}
        </li>
      ))}
    </ol>
  );
}
