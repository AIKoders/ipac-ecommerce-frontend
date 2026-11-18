import { atom } from 'nanostores';
import type { Locale } from '@/i18n';
import { getApi } from '@/lib/api';
import type { Session } from '@/lib/api/types';

/** `undefined` until the first answer: UI that depends on being signed in waits instead of flashing the guest state. */
export const $session = atom<Session | null | undefined>(undefined);

export async function loadSession(locale: Locale): Promise<Session | null> {
  const session = await getApi(locale).auth.getSession();
  $session.set(session);
  return session;
}

export async function signOut(locale: Locale): Promise<void> {
  await getApi(locale).auth.signOut();
  $session.set(null);
}
