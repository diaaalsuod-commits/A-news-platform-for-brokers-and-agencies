'use client';

import { forgotPasswordRequestSchema, passwordSchema } from '@reih/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { useApi, useErrorText } from '../api/hooks';
import {
  ErrorSummary,
  FormMessage,
  SubmitButton,
  TextField,
  useFieldErrorText,
  useZodForm,
} from '../forms';
import { isFinalLinkRefusal, useLinkToken } from '../link-token';
import { Link } from '../navigation';
import { PageFrame, PublicHeader } from '../shell';
import { richTags } from '../text';

/** FR-ACC-03: asks for a reset link. The answer is the same for every email. */
export function ForgotPasswordScreen() {
  const t = useTranslations('auth.forgot');
  const api = useApi();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const form = useZodForm(forgotPasswordRequestSchema, { email: '' });
  const { errors, isSubmitting, submitCount } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await api.post('/auth/forgot', { body: values, redirectOnUnauthorized: false });
      setSent(true);
    } catch (error) {
      setFailure(error);
    }
  });

  return (
    <PageFrame header={<PublicHeader />}>
      <section className="reih-card reih-narrow" aria-labelledby="forgot-title">
        <h1 id="forgot-title">{t('title')}</h1>
        {sent ? (
          <FormMessage tone="success">{t.rich('sent', richTags)}</FormMessage>
        ) : (
          <>
            <p>{t('intro')}</p>
            <ErrorSummary errors={errors} submitCount={submitCount} />
            {failure !== null && <FormMessage tone="error">{errorText(failure)}</FormMessage>}
            <form onSubmit={onSubmit} noValidate className="reih-form">
              <TextField
                label={t('email')}
                type="email"
                autoComplete="email"
                dir="ltr"
                error={fieldError(errors.email?.message)}
                {...form.register('email')}
              />
              <SubmitButton
                pending={isSubmitting}
                label={t('submit')}
                pendingLabel={t('submitting')}
              />
            </form>
          </>
        )}
        <p>
          <Link href="/login">{t('backToLogin')}</Link>
        </p>
      </section>
    </PageFrame>
  );
}

const resetFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    error: 'validation.passwordsDontMatch',
  });

/** FR-ACC-03: a new password from a single-use, 60-minute link. */
export function ResetPasswordScreen() {
  const t = useTranslations('auth.reset');
  const tForgot = useTranslations('auth.forgot');
  const api = useApi();
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const link = useLinkToken('reset');
  const [failure, setFailure] = useState<unknown>(null);
  const form = useZodForm(resetFormSchema, { password: '', confirmPassword: '' });
  const { errors, isSubmitting, submitCount } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await api.post('/auth/reset', {
        body: { token: link.token, password: values.password },
        redirectOnUnauthorized: false,
      });
      link.forget();
      router.replace(`/${locale}/login?done=reset`);
    } catch (error) {
      // A used, expired or unknown link will not work again: forget its token.
      link.forgetIfRefused(error);
      setFailure(error);
    }
  });

  const linkFailed = isFinalLinkRefusal(failure);

  return (
    <PageFrame header={<PublicHeader />}>
      <section className="reih-card reih-narrow" aria-labelledby="reset-title">
        <h1 id="reset-title">{t('title')}</h1>
        {!link.ready ? null : link.token === null ? (
          <FormMessage tone="error">{t('missingToken')}</FormMessage>
        ) : (
          <>
            <ErrorSummary errors={errors} submitCount={submitCount} />
            {failure !== null && <FormMessage tone="error">{errorText(failure)}</FormMessage>}
            {!linkFailed && (
              <form onSubmit={onSubmit} noValidate className="reih-form">
                <TextField
                  label={t('password')}
                  type="password"
                  autoComplete="new-password"
                  hint={t.rich('passwordHint', richTags)}
                  error={fieldError(errors.password?.message)}
                  {...form.register('password')}
                />
                <TextField
                  label={t('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  error={fieldError(errors.confirmPassword?.message)}
                  {...form.register('confirmPassword')}
                />
                <SubmitButton
                  pending={isSubmitting}
                  label={t('submit')}
                  pendingLabel={t('submitting')}
                />
              </form>
            )}
          </>
        )}
        <p className="reih-links">
          <Link href="/forgot-password">{t('requestNew')}</Link>
          <Link href="/login">{tForgot('backToLogin')}</Link>
        </p>
      </section>
    </PageFrame>
  );
}
