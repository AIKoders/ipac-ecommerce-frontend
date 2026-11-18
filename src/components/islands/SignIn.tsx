import { useStore } from '@nanostores/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '@/components/ui/Icon';
import { env } from '@/config/env';
import { localizePath, translator, type Locale } from '@/i18n';
import { auth } from '@/i18n/ns/auth';
import { common } from '@/i18n/ns/common';
import { getApi, isApiError } from '@/lib/api';
import { boot } from '@/stores/boot';
import { loadCart } from '@/stores/cart';
import { $session } from '@/stores/session';
import { withLoader } from '@/stores/ui';

/**
 * The sign-in card. Shoppers have no passwords: the first step emails a
 * 6-digit code and the second one checks it, in the same card. It is rendered
 * on the server at the first step, so the page is complete before it hydrates.
 */
const ERROR_ID = 'sign-in-error';
const CODE = /^\d{6}$/;

/** The page that sent the shopper here, when it is one of ours. */
function nextPath(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  // One leading slash stays on this site; "//host" and "/\host" would leave it.
  return next && /^\/(?![/\\])/.test(next) ? next : null;
}

export function SignIn({ locale }: { locale: Locale }) {
  const t = translator(auth, locale);
  const tc = translator(common, locale);
  const to = (path: string) => localizePath(locale, path);
  const api = getApi(locale);

  const session = useStore($session);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  /** The input of the step on screen. */
  const field = useRef<HTMLInputElement>(null);
  const changedStep = useRef(false);
  /** Set when this form signs the shopper in, so the redirect below does not override where they were going. */
  const signedInHere = useRef(false);

  useEffect(() => boot(locale), [locale]);

  // Someone who is already signed in has nothing to do here.
  useEffect(() => {
    if (session && !signedInHere.current) window.location.replace(to('/account'));
  }, [session]);

  // Moving between the steps puts the cursor in the field that just appeared (not on first load).
  useEffect(() => {
    if (changedStep.current) field.current?.focus();
  }, [step]);

  const address = email.trim();

  function fail(message: string): void {
    setError(message);
    field.current?.focus();
  }

  async function requestCode(event: Event): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.requestCode(address);
      changedStep.current = true;
      setCode('');
      setResent(false);
      setStep('code');
    } catch (cause) {
      fail(isApiError(cause) && cause.code === 'invalid' ? tc('invalidEmail') : tc('genericError'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: Event): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setResent(false);
    // An incomplete code is not worth a trip behind the loader.
    if (!CODE.test(code.trim())) return fail(t('invalidCode'));
    setBusy(true);
    setError(null);
    try {
      const signedIn = await withLoader(tc('signingIn'), () => api.auth.verifyCode(address, code.trim()), 1500);
      signedInHere.current = true;
      $session.set(signedIn);
      // The cart now belongs to the account, so the header shows the one the session has.
      await loadCart(locale);
      // Replacing keeps this form out of the history: Back from the account does not land on it.
      window.location.replace(nextPath() ?? to('/account'));
    } catch (cause) {
      setBusy(false);
      fail(isApiError(cause) && cause.code === 'invalid' ? t('invalidCode') : tc('genericError'));
    }
  }

  async function resend(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      await api.auth.requestCode(address);
      setResent(true);
    } catch {
      setError(tc('genericError'));
    } finally {
      setBusy(false);
    }
  }

  function changeEmail(): void {
    changedStep.current = true;
    setError(null);
    setStep('email');
  }

  const invalid = error ? { 'aria-invalid': 'true' as const, 'aria-describedby': ERROR_ID } : {};
  const errorLine = error && (
    <p id={ERROR_ID} class="err" role="alert">
      {error}
    </p>
  );

  return (
    <div class="card self-center">
      {step === 'email' ? (
        <form key="email" class="flex flex-col gap-4" method="post" noValidate onSubmit={requestCode}>
          <h2 class="hd text-[28px]">{t('formTitle')}</h2>
          <p class="mut">{t('formNote')}</p>
          <div class="flex flex-col gap-1.5">
            <label class="fld">
              {t('email')}
              <input ref={field} type="email" name="email" value={email} onInput={(event) => setEmail(event.currentTarget.value)} placeholder={tc('emailPlaceholder')} autocomplete="email" {...invalid} />
            </label>
            {errorLine}
          </div>
          <button class="btn full" type="submit" disabled={busy}>
            {busy ? t('sending') : t('continue')}
          </button>
        </form>
      ) : (
        <form key="code" class="flex flex-col gap-4" method="post" noValidate onSubmit={verify}>
          <h2 class="hd text-[28px]">{t('codeTitle')}</h2>
          <p class="mut">{t('codeNote', { email: address })}</p>
          {env.apiMode === 'mock' && <p class="note t">{t('demoNote')}</p>}
          <div class="flex flex-col gap-1.5">
            <label class="fld">
              {t('codeLabel')}
              <input ref={field} type="text" name="code" value={code} onInput={(event) => setCode(event.currentTarget.value)} inputmode="numeric" autocomplete="one-time-code" maxlength={6} {...invalid} />
            </label>
            {errorLine}
          </div>
          <button class="btn full" type="submit" disabled={busy}>
            {t('verify')}
          </button>
          <div class="sp flex-wrap">
            <button class="lnk text-[14px]" type="button" onClick={changeEmail}>
              {t('changeEmail')}
            </button>
            <button class="lnk text-[14px]" type="button" onClick={() => void resend()}>
              {t('resend')}
            </button>
          </div>
          {/* Always in the page so the confirmation is announced when its text arrives. */}
          <p class={resent ? 'fine' : 'sr'} role="status">
            {resent ? t('resent') : ''}
          </p>
        </form>
      )}
      <div class="sp">
        <span class="fine">{t('guestQuestion')}</span>
        <a class="lnk" href={to('/shop')}>
          {t('guestCta')}
          <Icon name="arrowRight" />
        </a>
      </div>
    </div>
  );
}
