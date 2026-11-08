'use client';

import {
  areaUnitValues,
  changePasswordRequestSchema,
  currencyListResponseSchema,
  langCodeValues,
  type MeResponse,
  meResponseSchema,
  phoneSchema,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoField,
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
} from '@reih/contracts';
import { isLocale } from '@reih/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '../api/errors';
import { ME_QUERY_KEY, rememberLocale, useApi, useErrorText } from '../api/hooks';
import { withLocale } from '../api/safe-next';
import {
  applyServerFieldErrors,
  ErrorSummary,
  FormMessage,
  SelectField,
  SubmitButton,
  TextField,
  useFieldErrorText,
  useZodForm,
} from '../forms';
import { AuthGate, LoadState } from '../shell';
import { richTags } from '../text';

/** FR-ACC-05, FR-ACC-06, FR-ACC-03: the caller's own account. */
export function ProfileScreen() {
  const t = useTranslations('profile');
  return (
    <AuthGate>
      {(me) => (
        <>
          <h1>{t('title')}</h1>
          <div className="reih-stack">
            <ProfileDetails me={me} />
            <PhotoSection me={me} />
            <PreferencesSection me={me} />
            <PasswordSection />
          </div>
        </>
      )}
    </AuthGate>
  );
}

function useSaveMe() {
  const queryClient = useQueryClient();
  return (me: MeResponse) => queryClient.setQueryData(ME_QUERY_KEY, me);
}

// ---------------------------------------------------------------- FR-ACC-05 profile fields

const profileShape = updateProfileRequestSchema.shape;
/** The form keeps "" for an empty phone; the request sends null. */
const optionalPhone = z.union([z.literal(''), phoneSchema]);
const profileFormSchema = z.object({
  fullName: profileShape.fullName.unwrap(),
  mobile: optionalPhone,
  whatsapp: optionalPhone,
  jobTitle: profileShape.jobTitle.unwrap(),
  brn: profileShape.brn.unwrap(),
});
const PROFILE_FIELDS = ['fullName', 'mobile', 'whatsapp', 'jobTitle', 'brn'] as const;

function ProfileDetails({ me }: { me: MeResponse }) {
  const t = useTranslations('profile.details');
  const api = useApi();
  const saveMe = useSaveMe();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const [result, setResult] = useState<{ ok: true } | { error: unknown } | null>(null);
  const form = useZodForm(profileFormSchema, {
    fullName: me.user.fullName ?? '',
    mobile: me.user.mobile ?? '',
    whatsapp: me.user.whatsapp ?? '',
    jobTitle: me.user.jobTitle ?? '',
    brn: me.user.brn ?? '',
  });
  const { errors, isSubmitting, submitCount } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    try {
      const updated = await api.patch<MeResponse>('/me', {
        body: {
          ...values,
          mobile: values.mobile === '' ? null : values.mobile,
          whatsapp: values.whatsapp === '' ? null : values.whatsapp,
        },
        schema: meResponseSchema,
      });
      saveMe(updated);
      setResult({ ok: true });
    } catch (error) {
      if (!applyServerFieldErrors(form, error, PROFILE_FIELDS)) setResult({ error });
    }
  });

  const phoneHint = t.rich('phoneHint', richTags);
  return (
    <section className="reih-card" aria-labelledby="profile-details-title">
      <h2 id="profile-details-title">{t('title')}</h2>
      <ErrorSummary errors={errors} submitCount={submitCount} />
      {result && 'ok' in result && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {result && 'error' in result && (
        <FormMessage tone="error">{errorText(result.error)}</FormMessage>
      )}
      <form onSubmit={onSubmit} noValidate className="reih-form">
        <TextField
          label={t('fullName')}
          autoComplete="name"
          error={fieldError(errors.fullName?.message)}
          {...form.register('fullName')}
        />
        <TextField
          label={t('mobile')}
          type="tel"
          dir="ltr"
          autoComplete="tel"
          hint={phoneHint}
          error={fieldError(errors.mobile?.message)}
          {...form.register('mobile')}
        />
        <TextField
          label={t('whatsapp')}
          type="tel"
          dir="ltr"
          hint={phoneHint}
          error={fieldError(errors.whatsapp?.message)}
          {...form.register('whatsapp')}
        />
        <TextField
          label={t('jobTitle')}
          autoComplete="organization-title"
          hint={t('optional')}
          error={fieldError(errors.jobTitle?.message)}
          {...form.register('jobTitle')}
        />
        <TextField
          label={t.rich('brn', richTags)}
          dir="ltr"
          hint={t('optional')}
          error={fieldError(errors.brn?.message)}
          {...form.register('brn')}
        />
        <SubmitButton pending={isSubmitting} label={t('submit')} pendingLabel={t('submitting')} />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- FR-ACC-05 photo

const PHOTO_TYPES = ['image/jpeg', 'image/png'];

function PhotoSection({ me }: { me: MeResponse }) {
  const t = useTranslations('profile.photo');
  const api = useApi();
  const saveMe = useSaveMe();
  const errorText = useErrorText();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<'upload' | 'remove' | null>(null);
  const [result, setResult] = useState<{ done: 'saved' | 'removed' } | { error: unknown } | null>(
    null,
  );

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    const file = input.current?.files?.[0];
    // Checked here too, to spare a useless upload; the server stays the judge (NFR-08).
    if (!file) {
      setResult({ error: null });
      return;
    }
    if (!PHOTO_TYPES.includes(file.type)) {
      setResult({ error: new ApiError('FILE_TYPE_NOT_ALLOWED', 415) });
      return;
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setResult({ error: new ApiError('FILE_TOO_LARGE', 413) });
      return;
    }
    setPending('upload');
    setResult(null);
    try {
      const formData = new FormData();
      formData.append(profilePhotoField, file);
      saveMe(await api.put<MeResponse>('/me/photo', { formData, schema: meResponseSchema }));
      setResult({ done: 'saved' });
      if (input.current) input.current.value = '';
    } catch (error) {
      setResult({ error });
    } finally {
      setPending(null);
    }
  };

  const remove = async () => {
    setPending('remove');
    setResult(null);
    try {
      saveMe(await api.delete<MeResponse>('/me/photo', { schema: meResponseSchema }));
      setResult({ done: 'removed' });
    } catch (error) {
      setResult({ error });
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="reih-card" aria-labelledby="profile-photo-title">
      <h2 id="profile-photo-title">{t('title')}</h2>
      {result && 'done' in result && <FormMessage tone="success">{t(result.done)}</FormMessage>}
      {result && 'error' in result && (
        <FormMessage tone="error">
          {result.error === null ? t('noFile') : errorText(result.error)}
        </FormMessage>
      )}
      <div className="reih-photo">
        {me.user.photoUrl ? (
          // A plain <img>: the API serves the photo behind the session, from the same origin.
          <img src={me.user.photoUrl} alt={t('alt')} width={96} height={96} />
        ) : (
          <p className="reih-muted">{t('none')}</p>
        )}
      </div>
      <form onSubmit={(event) => void upload(event)} className="reih-form">
        <div className="reih-field">
          <label htmlFor={inputId}>{t('choose')}</label>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png"
            aria-describedby={`${inputId}-hint`}
          />
          <p id={`${inputId}-hint`} className="reih-hint">
            {t.rich('hint', richTags)}
          </p>
        </div>
        <div className="reih-actions">
          <SubmitButton
            pending={pending === 'upload'}
            label={t('upload')}
            pendingLabel={t('uploading')}
          />
          {me.user.photoUrl && (
            <button type="button" disabled={pending !== null} onClick={() => void remove()}>
              {pending === 'remove' ? t('removing') : t('remove')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- FR-ACC-06 preferences

const preferencesShape = updatePreferencesRequestSchema.shape;
const preferencesFormSchema = z.object({
  language: preferencesShape.language.unwrap(),
  currency: preferencesShape.currency.unwrap(),
  areaUnit: preferencesShape.areaUnit.unwrap(),
});

function PreferencesSection({ me }: { me: MeResponse }) {
  const t = useTranslations('profile.preferences');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const api = useApi();
  const saveMe = useSaveMe();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const [result, setResult] = useState<{ ok: true } | { error: unknown } | null>(null);
  const currencies = useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies?pageSize=100', { schema: currencyListResponseSchema }),
  });
  const form = useZodForm(preferencesFormSchema, {
    language: me.preferences.language,
    currency: me.preferences.currency,
    areaUnit: me.preferences.areaUnit,
  });
  const { errors, isSubmitting, submitCount } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    try {
      const updated = await api.patch<MeResponse>('/me/preferences', {
        body: values,
        schema: meResponseSchema,
      });
      saveMe(updated);
      const language = updated.preferences.language;
      if (language !== locale && isLocale(language)) {
        rememberLocale(language);
        router.replace(
          withLocale(`${window.location.pathname}${window.location.search}`, language),
        );
        return;
      }
      setResult({ ok: true });
    } catch (error) {
      if (!applyServerFieldErrors(form, error, ['language', 'currency', 'areaUnit'])) {
        setResult({ error });
      }
    }
  });

  const currencyName = (item: { nameAr: string; nameEn: string }) =>
    // FR-LOC-03: a missing translation falls back to the other language.
    (locale === 'ar' ? item.nameAr || item.nameEn : item.nameEn || item.nameAr) ?? '';

  return (
    <section className="reih-card" aria-labelledby="profile-preferences-title">
      <h2 id="profile-preferences-title">{t('title')}</h2>
      <ErrorSummary errors={errors} submitCount={submitCount} />
      {result && 'ok' in result && <FormMessage tone="success">{t('saved')}</FormMessage>}
      {result && 'error' in result && (
        <FormMessage tone="error">{errorText(result.error)}</FormMessage>
      )}
      <form onSubmit={onSubmit} noValidate className="reih-form">
        <SelectField
          label={t('language')}
          error={fieldError(errors.language?.message)}
          {...form.register('language')}
        >
          {langCodeValues.map((code) => (
            <option key={code} value={code} lang={code}>
              {tCommon(`languageName.${code}`)}
            </option>
          ))}
        </SelectField>
        <LoadState
          pending={currencies.isPending}
          error={currencies.error}
          onRetry={() => void currencies.refetch()}
        >
          {currencies.data && currencies.data.items.length === 0 ? (
            <p className="reih-muted">{t('currenciesEmpty')}</p>
          ) : (
            <SelectField
              label={t('currency')}
              hint={t('currencyHint')}
              error={fieldError(errors.currency?.message)}
              {...form.register('currency')}
            >
              {(currencies.data?.items ?? []).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code} · {currencyName(item)}
                </option>
              ))}
            </SelectField>
          )}
        </LoadState>
        <SelectField
          label={t('areaUnit')}
          error={fieldError(errors.areaUnit?.message)}
          {...form.register('areaUnit')}
        >
          {areaUnitValues.map((unit) => (
            <option key={unit} value={unit}>
              {t(`areaUnits.${unit}`)}
            </option>
          ))}
        </SelectField>
        <SubmitButton pending={isSubmitting} label={t('submit')} pendingLabel={t('submitting')} />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- FR-ACC-03 password change

const passwordFormSchema = changePasswordRequestSchema
  .extend({ confirmNewPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    path: ['confirmNewPassword'],
    error: 'validation.passwordsDontMatch',
  });

function PasswordSection() {
  const t = useTranslations('profile.password');
  const api = useApi();
  const errorText = useErrorText();
  const fieldError = useFieldErrorText();
  const [result, setResult] = useState<{ ok: true } | { error: unknown } | null>(null);
  const empty = { currentPassword: '', newPassword: '', confirmNewPassword: '' };
  const form = useZodForm(passwordFormSchema, empty);
  const { errors, isSubmitting, submitCount } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    try {
      await api.post('/me/password', {
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword },
      });
      form.reset(empty);
      setResult({ ok: true });
    } catch (error) {
      setResult({ error });
    }
  });

  return (
    <section className="reih-card" aria-labelledby="profile-password-title">
      <h2 id="profile-password-title">{t('title')}</h2>
      <ErrorSummary errors={errors} submitCount={submitCount} />
      {result && 'ok' in result && <FormMessage tone="success">{t('changed')}</FormMessage>}
      {result && 'error' in result && (
        <FormMessage tone="error">{errorText(result.error)}</FormMessage>
      )}
      <form onSubmit={onSubmit} noValidate className="reih-form">
        <TextField
          label={t('current')}
          type="password"
          autoComplete="current-password"
          error={fieldError(errors.currentPassword?.message)}
          {...form.register('currentPassword')}
        />
        <TextField
          label={t('new')}
          type="password"
          autoComplete="new-password"
          hint={t.rich('hint', richTags)}
          error={fieldError(errors.newPassword?.message)}
          {...form.register('newPassword')}
        />
        <TextField
          label={t('confirm')}
          type="password"
          autoComplete="new-password"
          error={fieldError(errors.confirmNewPassword?.message)}
          {...form.register('confirmNewPassword')}
        />
        <SubmitButton pending={isSubmitting} label={t('submit')} pendingLabel={t('submitting')} />
      </form>
    </section>
  );
}
