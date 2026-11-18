import { Icon } from '@/components/ui/Icon';
import { env } from '@/config/env';
import { localizePath, translator, type Locale } from '@/i18n';
import { account } from '@/i18n/ns/account';
import { common } from '@/i18n/ns/common';
import type { Address, BillingProfile, Customer, Invoice } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/format';

interface Props {
  locale: Locale;
  customer: Customer;
  billing: BillingProfile;
  invoices: Invoice[];
}

/** Billing and addresses: the card on file, the delivery locations and one invoice per order. */
export function Billing({ locale, customer, billing, invoices }: Props) {
  const t = translator(account, locale);
  const tc = translator(common, locale);
  const contact = localizePath(locale, '/contact');
  const { card } = billing;
  // The mock's card is not anyone's: it is labelled as a sample instead of by its brand.
  const sample = env.apiMode === 'mock';

  return (
    <>
      <div class="dash">
        <section class="pnl">
          <span class="eyebrow">{tc('payment')}</span>
          <h2 class="hd">{t('cardOnFile')}</h2>
          {card ? (
            <div class="ccard">
              <span class={sample ? 'fine text-haze' : 'fine text-haze capitalize'}>{sample ? t('sampleCard') : card.brand}</span>
              <b>•••• •••• •••• {card.last4}</b>
              <div class="sp">
                <span>{customer.company}</span>
                <span>
                  {String(card.expMonth).padStart(2, '0')} / {String(card.expYear).slice(-2)}
                </span>
              </div>
            </div>
          ) : (
            <span class="mut">{t('noCard')}</span>
          )}
          {billing.netTermsAvailable && (
            <>
              <div class="note t">
                <Icon name="tag" />
                <span>{t('net30Note')}</span>
              </div>
              <a class="btn o sm self-start" href={contact}>
                {t('applyNet30')}
              </a>
            </>
          )}
        </section>

        <section class="pnl">
          <span class="eyebrow">{t('addresses')}</span>
          <h2 class="hd">{t('locations')}</h2>
          {billing.addresses.map((saved) => (
            <div class="addr" key={saved.id}>
              <div class="sp">
                <b>{saved.label}</b>
                {saved.isDefault && <span class="pillx g">{t('default')}</span>}
              </div>
              <span class="mut">{saved.address ? <AddressLines address={saved.address} /> : t('addressMissing')}</span>
              {saved.note && (
                <span class="fine">
                  <Icon name="truck" />
                  {saved.note}
                </span>
              )}
            </div>
          ))}
          <a class="addr new" href={contact}>
            <Icon name="plus" />
            {t('addLocation')}
          </a>
        </section>
      </div>

      <section class="pnl">
        <div class="sp">
          <h2 class="hd">{t('invoices')}</h2>
          <span class="fine">{t('invoicePerOrder')}</span>
        </div>
        {invoices.length === 0 ? (
          <span class="mut">{t('invoicesEmpty')}</span>
        ) : (
          <div>
            {invoices.map((invoice) => (
              <div class="inv" key={invoice.id}>
                <b>{invoice.number}</b>
                <span class="mut">{formatDate(invoice.issuedAt, locale)}</span>
                <span class={invoice.status === 'paid' ? 'pillx g' : 'pillx yl'}>{tc(invoice.status === 'paid' ? 'statusPaid' : 'statusDueOnDelivery')}</span>
                <b class="price text-[17px]">{formatMoney(invoice.total, locale)}</b>
                {/* The API has no invoice document yet. */}
                <button class="lnk text-[14px]" type="button" disabled aria-disabled="true">
                  {t('downloadPdf')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function AddressLines({ address }: { address: Address }) {
  return (
    <>
      {[address.line1, address.line2].filter(Boolean).join(', ')}
      <br />
      {address.city}, {address.region} {address.postalCode}
    </>
  );
}
