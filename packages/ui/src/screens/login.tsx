'use client';

import { loginRequestSchema, type MeResponse, meResponseSchema } from '@reih/contracts';
import { isLocale } from '@reih/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ME_QUERY_KEY,
  rememberLocale,
  useApi,
  useApp,
  useErrorText,
  useLogout,
  useOptionalMe,
} from '../api/hooks';
import { safeNextPath, withLocale } from '../api/safe-next';
import { servesRole } from '../app-config';
import {
  applyServerFieldErrors,
  ErrorSummary,
  FormMessage,
  SubmitButton,
  TextField,
  useFieldErrorText,
  useZodForm,
} from '../forms';
import { Link } from '../navigation';
import { PageFrame, PublicHeader } from '../shell';

export interface LoginScreenProps {
  /** ?next=: checked by safeNextPath, otherwise the role's home. */
  next?: string;
  /** ?done=: a confirmation after activation or a password reset. */
  done?: string;
}

/** UC-01.2, FR-ACC-02. */
export function LoginScreen({ next, done }: LoginScreenProps) {
  const t = useTranslations('auth.login');
  const app = useApp();
  const api = useApi();
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const current = useOptionalMe();
  const [failure, setFailure] = useState<unknown>(null);
  const form = useZodForm(loginRequestSchema, { email: '', password: '' });
  const { errors, isSubmitting, submitCount } = form.formState;

  /** The role's home, or ?next= when it is safe, in the saved language (FR-ACC-06). */
  const enter = (me: MeResponse) => {
    const language = isLocale(me.preferences.language) ? me.preferences.language : locale;
    if (isLocale(language)) rememberLocale(language);
    const target = safeNextPath(next) ?? '/';
    router.replace(isLocale(language) ? withLocale(target, language) : target);
  };

  // Already logged in in this app: no need to log in again.
  useEffect(() => {
    if (current.data && servesRole(app, current.data.role)) {
      enter(current.data);
    }
  }, [current.data]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const me = await api.post<MeResponse>('/auth/login', {
        body: values,
        schema: meResponseSchema,
        redirectOnUnauthorized: false,
      });
      if (!servesRole(app, me.role)) {
        // A session here is of no use: the other app has its own (docs/decisions.md).
        await logout('no-access');
        return;
      }
      queryClient.setQueryData(ME_QUERY_KEY, me);
      enter(me);
    } catch (error) {
      if (!applyServerFieldErrors(form, error, ['email', 'password'])) {
        setFailure(error);
      }
    }
  });

  return (
    <PageFrame header={<PublicHeader />}>
      <section className="reih-card reih-narrow" aria-labelledby="login-title">
        <h1 id="login-title">{t('title')}</h1>
        {done === 'activated' && <FormMessage tone="success">{t('activated')}</FormMessage>}
        {done === 'reset' && <FormMessage tone="success">{t('reset')}</FormMessage>}
        <ErrorSummary errors={errors} submitCount={submitCount} />
        {failure !== null && <FormMessage tone="error">{errorText(failure)}</FormMessage>}
        <form onSubmit={onSubmit} noValidate className="reih-form">
          <TextField
            label={t('email')}
            type="email"
            autoComplete="username"
            dir="ltr"
            error={fieldError(errors.email?.message)}
            {...form.register('email')}
          />
          <TextField
            label={t('password')}
            type="password"
            autoComplete="current-password"
            error={fieldError(errors.password?.message)}
            {...form.register('password')}
          />
          <SubmitButton pending={isSubmitting} label={t('submit')} pendingLabel={t('submitting')} />
        </form>
        <p>
          <Link href="/forgot-password">{t('forgot')}</Link>
        </p>
      </section>
    </PageFrame>
  );
}
