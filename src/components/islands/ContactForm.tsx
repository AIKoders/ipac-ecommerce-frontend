import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { localizePath, translator, type Locale } from '@/i18n';
import { common } from '@/i18n/ns/common';
import { contact } from '@/i18n/ns/contact';
import { getApi, isApiError, type ContactInput, type ContactTopic } from '@/lib/api';

/** In the order the form shows them, which is also the order errors are focused in. */
const FIELDS = ['name', 'business', 'email', 'phone', 'topic', 'message'] as const satisfies readonly (keyof ContactInput)[];
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;

const TOPICS = ['quote', 'consultation', 'order', 'account', 'other'] as const satisfies readonly ContactTopic[];

const isField = (value: string): value is Field => (FIELDS as readonly string[]).includes(value);
const isTopic = (value: string | null): value is ContactTopic => (TOPICS as readonly (string | null)[]).includes(value);

/**
 * The contact page's message and quote-request form. The API decides what is
 * valid; its per-field errors are shown under each field. Once the message is
 * accepted the card is replaced by the confirmation.
 */
export function ContactForm({ locale }: { locale: Locale }) {
  const t = translator(contact, locale);
  const tc = translator(common, locale);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [topic, setTopic] = useState<ContactTopic>('quote');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failed, setFailed] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const sendButton = useRef<HTMLButtonElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const focusFirstError = useRef(false);

  // Links such as "Book a packaging consultation" arrive with the topic already chosen.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('topic');
    if (isTopic(requested)) setTopic(requested);
  }, []);

  // After the errors are on screen, so the field is announced together with its message.
  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const first = FIELDS.find((field) => errors[field]);
    const control = first ? form.current?.elements.namedItem(first) : null;
    if (control instanceof HTMLElement) control.focus();
  }, [errors]);

  // A button that was disabled while focused drops the focus in some browsers: put it back for the retry.
  useEffect(() => {
    if (failed) sendButton.current?.focus();
  }, [failed]);

  useEffect(() => {
    if (state === 'done') sentHeading.current?.focus();
  }, [state]);

  const topicLabel: Record<ContactTopic, string> = {
    quote: t('topicQuote'),
    consultation: tc('bookConsultation'),
    order: t('topicOrder'),
    account: t('topicAccount'),
    other: t('topicOther'),
  };

  async function submit(data: FormData) {
    const text = (field: Field) => String(data.get(field) ?? '').trim();
    setState('sending');
    setErrors({});
    setFailed(false);
    try {
      await getApi(locale).forms.submitContact({
        name: text('name'),
        business: text('business') || undefined,
        email: text('email'),
        phone: text('phone') || undefined,
        topic,
        message: text('message'),
      });
      setState('done');
    } catch (cause) {
      const next: FieldErrors = {};
      if (isApiError(cause) && cause.code === 'invalid') {
        for (const error of cause.errors) {
          if (isField(error.field)) next[error.field] = error.field === 'email' && error.code !== 'required' ? tc('invalidEmail') : tc('required');
        }
      }
      const known = Object.keys(next).length > 0;
      focusFirstError.current = known;
      setErrors(next);
      setFailed(!known);
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <div class="card items-start" role="status">
        <span class="okdot size-[60px]">
          <Icon name="check" />
        </span>
        <h2 ref={sentHeading} class="hd text-[26px] outline-none" tabIndex={-1}>
          {t('sentTitle')}
        </h2>
        <p class="mut">{t('sentBody')}</p>
        <a class="btn o" href={localizePath(locale, '/shop')}>
          {t('backShop')}
        </a>
      </div>
    );
  }

  const sending = state === 'sending';
  const errorId = (field: Field) => `contact-${field}-error`;
  /** What a control needs to be tied to its error; the palette has no red, so the navy border and the bold note carry the state. */
  const control = (field: Field) => ({
    name: field,
    'aria-invalid': errors[field] ? ('true' as const) : undefined,
    'aria-describedby': errors[field] ? errorId(field) : undefined,
    class: errors[field] ? 'border-2 border-navy' : undefined,
  });
  const note = (field: Field) =>
    errors[field] && (
      <p id={errorId(field)} class="err" role="alert">
        {errors[field]}
      </p>
    );

  return (
    <form
      ref={form}
      class="card"
      noValidate
      aria-busy={sending}
      onSubmit={(event) => {
        event.preventDefault();
        if (!sending) void submit(new FormData(event.currentTarget));
      }}
    >
      <h2 class="hd text-[26px]">{t('formTitle')}</h2>
      <div class="fgrid">
        <div class="flex flex-col gap-1.5">
          <label class="fld">
            {t('name')}
            <input type="text" autocomplete="name" required {...control('name')} />
          </label>
          {note('name')}
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="fld">
            {t('business')}
            <input type="text" autocomplete="organization" {...control('business')} />
          </label>
          {note('business')}
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="fld">
            {tc('email')}
            <input type="email" autocomplete="email" required {...control('email')} />
          </label>
          {note('email')}
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="fld">
            {t('phone')}
            <input type="tel" autocomplete="tel" {...control('phone')} />
          </label>
          {note('phone')}
        </div>
        <div class="col-span-full flex flex-col gap-1.5">
          <label class="fld">
            {t('topic')}
            <select
              {...control('topic')}
              value={topic}
              onChange={(event) => {
                const { value } = event.currentTarget;
                if (isTopic(value)) setTopic(value);
              }}
            >
              {TOPICS.map((option) => (
                <option key={option} value={option}>
                  {topicLabel[option]}
                </option>
              ))}
            </select>
          </label>
          {note('topic')}
        </div>
        <div class="col-span-full flex flex-col gap-1.5">
          <label class="fld">
            {t('details')}
            <textarea placeholder={t('detailsPlaceholder')} required {...control('message')} />
          </label>
          {note('message')}
        </div>
      </div>
      {failed && (
        <p class="err" role="alert">
          {tc('genericError')}
        </p>
      )}
      <button ref={sendButton} class="btn self-start disabled:pointer-events-none disabled:opacity-60" type="submit" disabled={sending}>
        {t('send')}
        <Icon name="arrowRight" />
      </button>
      <span class="sr" role="status">
        {sending ? t('sending') : ''}
      </span>
    </form>
  );
}
