'use client';

import {
  AGENCY_LOGO_MAX_BYTES,
  agencyLogoField,
  type Branding,
  brandingSchema,
  inviteMemberRequestSchema,
  langCodeValues,
  type Member,
  memberRoleValues,
  updateBrandingRequestSchema,
} from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { useApi, useErrorText } from '../api/hooks';
import { useRefreshLists } from '../api/lists';
import { ConfirmDialog } from '../dialog';
import {
  ApiForm,
  FormMessage,
  SelectField,
  TextField,
  useApiForm,
  useFieldErrorText,
} from '../forms';
import { AuthGate, LoadState } from '../shell';
import { Tabs } from '../tabs';
import { Ltr, richTags } from '../text';
import { AccountsTable, InvitationsTable } from './parts';

const BRANDING_PATH = '/agency/branding';

/** FR-AGY-01 to FR-AGY-04, UC-04.1 to UC-04.7: the Agency Admin's own agency. */
export function AgencySettingsScreen() {
  const t = useTranslations('agencySettings');
  const [tab, setTab] = useState('branding');
  return (
    <AuthGate roles={['agency_admin']} wide>
      {(me) => (
        <>
          <h1>{t('title')}</h1>
          <Tabs
            label={t('title')}
            selected={tab}
            onSelect={setTab}
            tabs={[
              { id: 'branding', label: t('tabs.branding'), content: <BrandingTab /> },
              {
                id: 'members',
                label: t('tabs.members'),
                content: <MembersTab meId={me.user.id} />,
              },
              { id: 'invitations', label: t('tabs.invitations'), content: <InvitationsTab /> },
            ]}
          />
        </>
      )}
    </AuthGate>
  );
}

// ---------------------------------------------------------------- branding (FR-AGY-01)

function useBranding() {
  const api = useApi();
  return useQuery({
    queryKey: ['item', BRANDING_PATH],
    queryFn: () => api.get<Branding>(BRANDING_PATH, { schema: brandingSchema }),
  });
}

function BrandingTab() {
  const branding = useBranding();
  return (
    <LoadState
      pending={branding.isPending}
      error={branding.error}
      onRetry={() => void branding.refetch()}
    >
      {branding.data && <BrandingEditor branding={branding.data} />}
    </LoadState>
  );
}

function BrandingEditor({ branding }: { branding: Branding }) {
  const t = useTranslations('agencySettings.branding');
  const tDialog = useTranslations('dialog');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(updateBrandingRequestSchema, {
    defaultValues: {
      marketingName: branding.marketingName,
      primaryColor: branding.primaryColor,
      secondaryColor: branding.secondaryColor,
      phone: branding.phone ?? '',
      email: branding.email ?? '',
      website: branding.website ?? '',
      address: branding.address ?? '',
      orn: branding.orn ?? '',
    },
    onSubmit: async (values) => {
      await api.put(BRANDING_PATH, { body: values, schema: brandingSchema });
      await refresh(BRANDING_PATH);
      return t('saved');
    },
  });
  const { errors } = form.form.formState;
  const values = form.form.watch();

  const colorField = (name: 'primaryColor' | 'secondaryColor', label: ReactNode) => (
    <div className="reih-color-field">
      <input
        type="color"
        aria-label={t('pick', { name: String(label) })}
        value={/^#[0-9A-Fa-f]{6}$/.test(values[name] ?? '') ? values[name] : '#000000'}
        onChange={(event) =>
          form.form.setValue(name, event.target.value.toUpperCase(), { shouldValidate: true })
        }
      />
      <TextField
        label={label}
        dir="ltr"
        hint={t('colorHint')}
        error={fieldError(errors[name]?.message)}
        {...form.form.register(name)}
      />
    </div>
  );

  return (
    <div className="reih-two-columns">
      <section className="reih-card" aria-labelledby="branding-form-title">
        <h2 id="branding-form-title">{t('title')}</h2>
        {branding.isDefault && <p className="reih-hint">{t('defaultHint')}</p>}
        <ApiForm api={form} submitLabel={t('save')} pendingLabel={tDialog('working')}>
          <TextField
            label={t('marketingName')}
            error={fieldError(errors.marketingName?.message)}
            {...form.form.register('marketingName')}
          />
          {colorField('primaryColor', t('primaryColor'))}
          {colorField('secondaryColor', t('secondaryColor'))}
          <TextField
            label={t('phone')}
            type="tel"
            dir="ltr"
            hint={t.rich('phoneHint', richTags)}
            error={fieldError(errors.phone?.message)}
            {...form.form.register('phone')}
          />
          <TextField
            label={t('email')}
            type="email"
            dir="ltr"
            error={fieldError(errors.email?.message)}
            {...form.form.register('email')}
          />
          <TextField
            label={t('website')}
            type="url"
            dir="ltr"
            hint={t('websiteHint')}
            error={fieldError(errors.website?.message)}
            {...form.form.register('website')}
          />
          <TextField
            label={t('address')}
            error={fieldError(errors.address?.message)}
            {...form.form.register('address')}
          />
          <TextField
            label={t('orn')}
            dir="ltr"
            inputMode="numeric"
            hint={t('ornHint')}
            error={fieldError(errors.orn?.message)}
            {...form.form.register('orn')}
          />
        </ApiForm>
      </section>
      <div className="reih-stack">
        <section className="reih-card" aria-labelledby="branding-preview-title">
          <h2 id="branding-preview-title">{t('preview')}</h2>
          <BrandPreview
            marketingName={values.marketingName ?? ''}
            primaryColor={values.primaryColor ?? ''}
            secondaryColor={values.secondaryColor ?? ''}
            phone={String(values.phone ?? '')}
            email={String(values.email ?? '')}
            website={String(values.website ?? '')}
            logoUrl={branding.logoUrl}
          />
        </section>
        <LogoSection branding={branding} />
      </div>
    </div>
  );
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** A live preview of the form's colors and the saved logo, as a catalog cover would show them. */
function BrandPreview(props: {
  marketingName: string;
  primaryColor: string;
  secondaryColor: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string | null;
}) {
  const t = useTranslations('agencySettings.branding');
  const primary = HEX.test(props.primaryColor) ? props.primaryColor : '#1F3A5F';
  const secondary = HEX.test(props.secondaryColor) ? props.secondaryColor : '#C9A227';
  return (
    <div className="reih-brand-preview" aria-label={t('preview')} role="img">
      <header style={{ background: primary }}>
        {props.logoUrl && (
          // A plain <img>: the API serves the logo behind the session, from the same origin.
          <img src={props.logoUrl} alt="" />
        )}
        <strong>{props.marketingName || t('marketingName')}</strong>
      </header>
      <div className="reih-brand-accent" style={{ background: secondary }} />
      <dl className="reih-details">
        {props.phone && (
          <>
            <dt>{t('phone')}</dt>
            <dd>
              <Ltr>{props.phone}</Ltr>
            </dd>
          </>
        )}
        {props.email && (
          <>
            <dt>{t('email')}</dt>
            <dd>
              <Ltr>{props.email}</Ltr>
            </dd>
          </>
        )}
        {props.website && (
          <>
            <dt>{t('website')}</dt>
            <dd>
              <Ltr>{props.website}</Ltr>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

const LOGO_TYPES = ['image/png', 'image/svg+xml'];

/** FR-AGY-01: PNG or SVG up to 2 MB; the server judges the real type and sanitizes an SVG. */
function LogoSection({ branding }: { branding: Branding }) {
  const t = useTranslations('agencySettings.logo');
  const api = useApi();
  const refresh = useRefreshLists();
  const errorText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [isSvg, setIsSvg] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: ReactNode } | null>(
    null,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const file = input.current?.files?.[0];
    if (!file) {
      setMessage({ tone: 'error', text: t('choose') });
      return;
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setMessage({ tone: 'error', text: t('wrongType') });
      return;
    }
    if (file.size > AGENCY_LOGO_MAX_BYTES) {
      setMessage({ tone: 'error', text: t('tooLarge') });
      return;
    }
    setPending(true);
    try {
      const formData = new FormData();
      formData.append(agencyLogoField, file);
      await api.put(`${BRANDING_PATH}/logo`, { formData, schema: brandingSchema });
      await refresh(BRANDING_PATH);
      if (input.current) input.current.value = '';
      setIsSvg(false);
      setMessage({ tone: 'success', text: t('uploaded') });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="reih-card" aria-labelledby="logo-title">
      <h2 id="logo-title">{t('title')}</h2>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <form className="reih-form" onSubmit={(event) => void upload(event)} noValidate>
        <div className="reih-field">
          <label htmlFor={inputId}>{t('file')}</label>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept="image/png,image/svg+xml"
            aria-describedby={`${inputId}-hint${isSvg ? ` ${inputId}-svg` : ''}`}
            onChange={(event) => setIsSvg(event.target.files?.[0]?.type === 'image/svg+xml')}
          />
          <p id={`${inputId}-hint`} className="reih-hint">
            {t.rich('hint', richTags)}
          </p>
          {isSvg && (
            <p id={`${inputId}-svg`} className="reih-alert" data-tone="info" role="note">
              {t.rich('svgNote', { ...richTags, code: (chunks) => <code>{chunks}</code> })}
            </p>
          )}
        </div>
        <div className="reih-actions">
          <button type="submit" className="reih-primary" disabled={pending} aria-busy={pending}>
            {pending ? t('uploading') : t('upload')}
          </button>
          {branding.logoUrl && (
            <button type="button" onClick={() => setConfirmRemove(true)}>
              {t('remove')}
            </button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t('removeTitle')}
        body={t('removeBody')}
        confirmLabel={t('remove')}
        danger
        onConfirm={async () => {
          await api.delete(`${BRANDING_PATH}/logo`, { schema: brandingSchema });
          await refresh(BRANDING_PATH);
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------- members (FR-AGY-03, FR-AGY-04)

function MembersTab({ meId }: { meId: string }) {
  const t = useTranslations('agencySettings.members');
  const api = useApi();
  return (
    <section aria-labelledby="members-title">
      <h2 id="members-title">{t('title')}</h2>
      <p className="reih-hint">{t('lastAdminHint')}</p>
      <AccountsTable<Member>
        caption={t('title')}
        listPath="/agency/members"
        meId={meId}
        roles={memberRoleValues}
        empty={t('empty')}
        actions={{
          changeRole: async (id, role) => {
            await api.patch(`/agency/members/${id}/role`, { body: { role } });
          },
          setStatus: async (id, status) => {
            await api.patch(`/agency/members/${id}/status`, { body: { status } });
          },
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------- invitations (FR-AGY-02)

function InvitationsTab() {
  const t = useTranslations('agencySettings.invitations');
  const tInv = useTranslations('invitations');
  const tRoles = useTranslations('roles');
  const tDialog = useTranslations('dialog');
  const tCommon = useTranslations('common');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(inviteMemberRequestSchema, {
    defaultValues: { email: '', role: 'broker', language: undefined },
    onSubmit: async (values) => {
      await api.post('/agency/invitations', { body: values });
      await Promise.all([refresh('/agency/invitations'), refresh('/agency/members')]);
      form.form.reset({ email: '', role: values.role, language: undefined });
      return t.rich('sent', { email: values.email, ...richTags }) as ReactNode;
    },
  });
  const { errors } = form.form.formState;
  return (
    <div className="reih-stack">
      <section className="reih-card" aria-labelledby="invite-title">
        <h2 id="invite-title">{t('title')}</h2>
        <ApiForm api={form} submitLabel={t('submit')} pendingLabel={tDialog('working')}>
          <TextField
            label={tInv('columns.email')}
            type="email"
            dir="ltr"
            autoComplete="off"
            error={fieldError(errors.email?.message)}
            {...form.form.register('email')}
          />
          <SelectField
            label={tInv('columns.role')}
            error={fieldError(errors.role?.message)}
            {...form.form.register('role')}
          >
            {memberRoleValues.map((role) => (
              <option key={role} value={role}>
                {tRoles(role)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={tInv('language')}
            hint={tInv('languageHint')}
            {...form.form.register('language', { setValueAs: (value) => value || undefined })}
          >
            <option value="">{tInv('languageDefault')}</option>
            {langCodeValues.map((code) => (
              <option key={code} value={code}>
                {tCommon(`languageName.${code}`)}
              </option>
            ))}
          </SelectField>
        </ApiForm>
      </section>
      <section className="reih-card" aria-labelledby="pending-title">
        <h2 id="pending-title">{t('pending')}</h2>
        <InvitationsTable
          caption={t('pending')}
          listPath="/agency/invitations"
          actionBase="/agency/invitations"
          empty={t('empty')}
          alsoRefresh={['/agency/members']}
        />
      </section>
    </div>
  );
}
