'use client';

import { invitationCheckResponseSchema, passwordSchema } from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useApi, useErrorText } from '../api/hooks';
import {
  CheckboxField,
  ErrorSummary,
  FormMessage,
  SubmitButton,
  TextField,
  useFieldErrorText,
  useZodForm,
} from '../forms';
import { isFinalLinkRefusal, useLinkToken } from '../link-token';
import { Link } from '../navigation';
import { LoadState, PageFrame, PublicHeader } from '../shell';
import { richTags } from '../text';

/** FR-ACC-01: the password rule of packages/contracts, typed twice, and the terms accepted. */
const activationFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: 'validation.termsRequired' }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    error: 'validation.passwordsDontMatch',
  });

/** The message key of a terms version, for example "1.0" -> legal.versions.1_0. */
const termsKey = (version: string) => `versions.${version.replace(/\./g, '_')}`;

/** UC-01.1, FR-ACC-01. */
export function ActivateScreen() {
  const t = useTranslations('auth.activate');
  const tLegal = useTranslations('legal');
  const tRoles = useTranslations('roles');
  const tForgot = useTranslations('auth.forgot');
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const link = useLinkToken('activate');
  const [failure, setFailure] = useState<unknown>(null);

  const invitation = useQuery({
    queryKey: ['invitation', link.token],
    enabled: link.token !== null,
    queryFn: () =>
      api.get(`/auth/invitations/${link.token}`, {
        schema: invitationCheckResponseSchema,
        redirectOnUnauthorized: false,
      }),
  });

  // The check itself may refuse the link for good; then its token is forgotten too.
  const { forgetIfRefused } = link;
  useEffect(() => {
    if (invitation.error) forgetIfRefused(invitation.error);
  }, [invitation.error, forgetIfRefused]);

  const form = useZodForm(activationFormSchema, {
    password: '',
    confirmPassword: '',
    acceptTerms: false as unknown as true,
  });
  const { errors, isSubmitting, submitCount } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await api.post('/auth/activate', {
        body: { token: link.token, password: values.password, acceptTerms: values.acceptTerms },
        redirectOnUnauthorized: false,
      });
      link.forget();
      router.replace(`/${locale}/login?done=activated`);
    } catch (error) {
      // An expired, used, cancelled or unknown link will not work again: forget its token.
      link.forgetIfRefused(error);
      setFailure(error);
    }
  });

  let body;
  if (!link.ready) {
    body = <p role="status">{t('checking')}</p>;
  } else if (link.token === null) {
    body = <FormMessage tone="error">{t('missingToken')}</FormMessage>;
  } else if (isFinalLinkRefusal(invitation.error)) {
    // Expired, used, cancelled or unknown: trying again cannot help, so no retry button.
    body = <FormMessage tone="error">{errorText(invitation.error)}</FormMessage>;
  } else {
    const data = invitation.data;
    const version = data?.termsVersion ?? '';
    const hasTerms =
      data !== undefined &&
      tLegal.has(`${termsKey(version)}.terms`) &&
      tLegal.has(`${termsKey(version)}.privacy`);
    body = (
      <LoadState
        pending={invitation.isPending}
        error={invitation.error}
        onRetry={() => void invitation.refetch()}
      >
        {data && (
          <>
            <p>
              {t.rich('invitedAs', {
                role: tRoles(data.role),
                email: data.email,
                ...richTags,
              })}
            </p>
            <p className="reih-muted">
              {t.rich('expires', {
                date: format.dateTime(new Date(data.expiresAt), {
                  dateStyle: 'long',
                  timeStyle: 'short',
                }),
                ...richTags,
              })}
            </p>
            {!hasTerms ? (
              <FormMessage tone="error">
                {tLegal.rich('missing', { version, ...richTags })}
              </FormMessage>
            ) : (
              <>
                <details className="reih-legal">
                  <summary>{tLegal('termsTitle')}</summary>
                  <p>{tLegal.rich(`${termsKey(version)}.terms`, richTags)}</p>
                </details>
                <details className="reih-legal">
                  <summary>{tLegal('privacyTitle')}</summary>
                  <p>{tLegal.rich(`${termsKey(version)}.privacy`, richTags)}</p>
                </details>
                <ErrorSummary errors={errors} submitCount={submitCount} />
                {failure !== null && <FormMessage tone="error">{errorText(failure)}</FormMessage>}
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
                  <CheckboxField
                    label={t.rich('acceptTerms', { version, ...richTags })}
                    error={fieldError(errors.acceptTerms?.message)}
                    {...form.register('acceptTerms')}
                  />
                  <SubmitButton
                    pending={isSubmitting}
                    label={t('submit')}
                    pendingLabel={t('submitting')}
                  />
                </form>
              </>
            )}
          </>
        )}
      </LoadState>
    );
  }

  return (
    <PageFrame header={<PublicHeader />}>
      <section className="reih-card reih-narrow" aria-labelledby="activate-title">
        <h1 id="activate-title">{t('title')}</h1>
        {body}
        <p>
          <Link href="/login">{tForgot('backToLogin')}</Link>
        </p>
      </section>
    </PageFrame>
  );
}
