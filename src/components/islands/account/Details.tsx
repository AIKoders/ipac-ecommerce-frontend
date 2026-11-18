import { Icon } from '@/components/ui/Icon';
import { env } from '@/config/env';
import { locales, localizePath, translator, type Locale } from '@/i18n';
import { account } from '@/i18n/ns/account';
import { common } from '@/i18n/ns/common';
import type { Customer } from '@/lib/api/types';

const LANGUAGE_NAME = { en: 'english', es: 'spanish' } as const;

/** Account details, read-only, and the shopper's preferences. */
export function Details({ locale, customer }: { locale: Locale; customer: Customer }) {
  const t = translator(account, locale);
  const tc = translator(common, locale);

  return (
    <>
      <section class="pnl">
        <h2 class="hd">{t('details')}</h2>
        <div class="fgrid">
          <label class="fld">
            {tc('businessName')}
            <input type="text" value={customer.company} readOnly />
          </label>
          <label class="fld">
            {tc('contact')}
            <input type="text" value={customer.firstName} readOnly />
          </label>
          <label class="fld">
            {tc('email')}
            <input type="email" value={customer.email} readOnly />
          </label>
          <label class="fld">
            {t('paymentTerms')}
            <input type="text" value={t('termsValue')} readOnly />
          </label>
        </div>
        {env.apiMode === 'mock' && <span class="fine">{t('sampleNote')}</span>}
      </section>

      <section class="pnl">
        <h2 class="hd">{t('preferences')}</h2>
        <div class="sp flex-wrap">
          <div>
            <b>{tc('language')}</b>
            <br />
            <span class="fine">{t('languageNote')}</span>
          </div>
          {/* The language is the page's address, so choosing one is a link to this section in that language. */}
          <div class="seg" role="group" aria-label={tc('language')}>
            {locales.map((code) => (
              <a key={code} class={code === locale ? 'on' : undefined} href={`${localizePath(code, '/account')}?tab=details`} hreflang={code} lang={code} aria-current={code === locale ? 'true' : undefined}>
                {tc(LANGUAGE_NAME[code])}
              </a>
            ))}
          </div>
        </div>
        <Preference title={t('deliveryUpdates')} note={t('deliveryUpdatesNote')} on={t('on')} />
        <Preference title={tc('restockReminders')} note={t('restockRemindersNote')} on={t('on')} />
      </section>
    </>
  );
}

/** A notification the account has switched on. There is nothing to change yet, so it is shown as a state. */
function Preference({ title, note, on }: { title: string; note: string; on: string }) {
  return (
    <div class="sp flex-wrap">
      <div>
        <b>{title}</b>
        <br />
        <span class="fine">{note}</span>
      </div>
      <span class="pillx g">
        <Icon name="check" />
        {on}
      </span>
    </div>
  );
}
