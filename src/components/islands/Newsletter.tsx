import { useState } from 'preact/hooks';
import { translator, type Locale } from '@/i18n';
import { footer } from '@/i18n/ns/footer';
import { getApi, isApiError } from '@/lib/api';

/** The footer's restock-reminder sign-up. */
export function Newsletter({ locale }: { locale: Locale }) {
  const t = translator(footer, locale);
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'done') {
    return (
      <p class="mt-2 text-yellow" role="status">
        {t('joined')}
      </p>
    );
  }

  return (
    <form
      class="news"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get('email') ?? '');
        setState('sending');
        setError(null);
        try {
          await getApi(locale).forms.subscribeNewsletter(email);
          setState('done');
        } catch (cause) {
          setState('idle');
          setError(isApiError(cause) && cause.code === 'invalid' ? t('invalidEmail') : t('invalidEmail'));
        }
      }}
    >
      <label class="sr" for="news">
        {t('emailAddress')}
      </label>
      <input id="news" name="email" type="email" placeholder={t('emailAddress')} autocomplete="email" aria-invalid={error ? 'true' : undefined} aria-describedby={error ? 'news-error' : undefined} />
      <button class="btn y sm" type="submit" disabled={state === 'sending'}>
        {t('join')}
      </button>
      {error && (
        <p id="news-error" class="fine absolute top-full mt-1.5 text-yellow" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
