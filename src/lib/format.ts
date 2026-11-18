import { intlLocale, type Locale } from '@/i18n';
import type { Money } from '@/lib/api/types';

const DAY = 86_400_000;
const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Minor units → "$1,234.50". Amounts are integers end to end; this is the only place they become text. */
export function formatMoney(money: Money, locale: Locale): string {
  const key = `${locale}:${money.currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(intlLocale[locale], { style: 'currency', currency: money.currency });
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(money.amount / 100);
}

export const usd = (amount: number): Money => ({ amount, currency: 'USD' });

/**
 * A calendar day ("2026-10-20") is that day wherever it is read; `new Date()`
 * would take it as midnight UTC and show the day before west of Greenwich.
 */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
}

/** "Nov 19, 2026" */
export const formatDate = (value: string | Date, locale: Locale): string =>
  toDate(value).toLocaleDateString(intlLocale[locale], { month: 'short', day: 'numeric', year: 'numeric' });

/** "Nov 19" */
export const formatShortDate = (value: string | Date, locale: Locale): string =>
  toDate(value).toLocaleDateString(intlLocale[locale], { month: 'short', day: 'numeric' });

/** "Thursday, Nov 19" */
export const formatWeekday = (value: string | Date, locale: Locale): string =>
  toDate(value).toLocaleDateString(intlLocale[locale], { weekday: 'long', month: 'short', day: 'numeric' });

/** The next weekday after `from`: local delivery goes out the following business day. */
export function nextBusinessDay(from: Date = new Date()): Date {
  let date = new Date(from.getTime() + DAY);
  while (date.getDay() === 0 || date.getDay() === 6) date = new Date(date.getTime() + DAY);
  return date;
}

export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * DAY);

export const isSameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();
