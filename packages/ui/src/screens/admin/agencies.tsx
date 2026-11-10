'use client';

import {
  type Agency,
  agencySchema,
  createAgencyRequestSchema,
  inviteAgencyAdminRequestSchema,
  langCodeValues,
  updateAgencyRequestSchema,
} from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useApi } from '../../api/hooks';
import { useFullList, useRefreshLists } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { Dialog, ReasonDialog } from '../../dialog';
import { ApiForm, SelectField, TextField, useApiForm, useFieldErrorText } from '../../forms';
import { Link, useRouter } from '../../navigation';
import { AuthGate, LoadState } from '../../shell';
import { Ltr, richTags } from '../../text';
import { DateTime, InvitationsTable } from '../parts';

const PLATFORM_ADMIN = ['platform_admin'] as const;

function AgencyStatusBadge({ status }: { status: Agency['status'] }) {
  const t = useTranslations('admin.agencies.status');
  return (
    <span className="reih-badge" data-tone={status === 'suspended' ? 'warning' : 'success'}>
      {t(status)}
    </span>
  );
}

// ---------------------------------------------------------------- list (FR-ADM-01)

/** FR-ADM-01, UC-06.1: every agency, with search, a status filter and "New agency". */
export function AgenciesScreen() {
  const t = useTranslations('admin.agencies');
  return (
    <AuthGate roles={PLATFORM_ADMIN} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <AgencyList />
        </>
      )}
    </AuthGate>
  );
}

function AgencyList() {
  const t = useTranslations('admin.agencies');
  const router = useRouter();
  const [filters, setFilters] = useState<{ q?: string; status?: string }>({});
  const [draft, setDraft] = useState({ q: '', status: '' });
  const [creating, setCreating] = useState(false);
  const list = useFullList<Agency>('/admin/agencies', filters);

  const columns: Column<Agency>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      cell: (row) => (
        <Link href={`/agencies/${row.id}`}>
          <span lang="en">{row.nameEn}</span>
        </Link>
      ),
      sortValue: (row) => row.nameEn,
    },
    {
      key: 'nameAr',
      header: t('columns.nameAr'),
      cell: (row) => <span lang="ar">{row.nameAr}</span>,
      sortValue: (row) => row.nameAr,
    },
    {
      key: 'license',
      header: t('columns.license'),
      cell: (row) => <Ltr>{row.tradeLicenseNo}</Ltr>,
      sortValue: (row) => row.tradeLicenseNo,
    },
    {
      key: 'email',
      header: t('columns.email'),
      cell: (row) => <Ltr>{row.contactEmail}</Ltr>,
      sortValue: (row) => row.contactEmail,
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => <AgencyStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
    {
      key: 'created',
      header: t('columns.created'),
      cell: (row) => <DateTime iso={row.createdAt} />,
      sortValue: (row) => new Date(row.createdAt),
    },
  ];

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ q: draft.q || undefined, status: draft.status || undefined });
  };

  return (
    <>
      <form className="reih-toolbar" role="search" onSubmit={search}>
        <TextField
          label={t('search')}
          type="search"
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
        />
        <SelectField
          label={t('columns.status')}
          value={draft.status}
          onChange={(event) => setDraft({ ...draft, status: event.target.value })}
        >
          <option value="">{t('status.all')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="suspended">{t('status.suspended')}</option>
        </SelectField>
        <button type="submit">{t('apply')}</button>
        <button type="button" className="reih-primary" onClick={() => setCreating(true)}>
          {t('new')}
        </button>
      </form>
      <DataTable
        caption={t('caption')}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={filters.q || filters.status ? t('noMatch') : t('empty')}
        initialSort={{ key: 'name', direction: 'asc' }}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title={t('new')}>
        <AgencyForm
          mode="create"
          onDone={(agency) => {
            setCreating(false);
            router.push(`/agencies/${agency.id}`);
          }}
          onCancel={() => setCreating(false)}
        />
      </Dialog>
    </>
  );
}

/** FR-ADM-01: Arabic and English names, a unique trade license, contact email and phone. */
function AgencyForm({
  mode,
  agency,
  onDone,
  onCancel,
}: {
  mode: 'create' | 'edit';
  agency?: Agency;
  onDone: (agency: Agency) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('admin.agencies.form');
  const tDialog = useTranslations('dialog');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(
    mode === 'create' ? createAgencyRequestSchema : updateAgencyRequestSchema,
    {
      defaultValues: {
        nameAr: agency?.nameAr ?? '',
        nameEn: agency?.nameEn ?? '',
        tradeLicenseNo: agency?.tradeLicenseNo ?? '',
        contactEmail: agency?.contactEmail ?? '',
        contactPhone: agency?.contactPhone ?? '',
      },
      onSubmit: async (values) => {
        const saved =
          mode === 'create'
            ? await api.post<Agency>('/admin/agencies', { body: values, schema: agencySchema })
            : await api.patch<Agency>(`/admin/agencies/${agency?.id}`, {
                body: values,
                schema: agencySchema,
              });
        await refresh('/admin/agencies');
        onDone(saved);
        return mode === 'edit' ? t('saved') : undefined;
      },
    },
  );
  const { errors } = form.form.formState;
  const phoneHint = t.rich('phoneHint', richTags);
  return (
    <ApiForm
      api={form}
      submitLabel={mode === 'create' ? t('create') : t('save')}
      pendingLabel={tDialog('working')}
      secondary={
        onCancel && (
          <button type="button" onClick={onCancel}>
            {tDialog('cancel')}
          </button>
        )
      }
    >
      <TextField
        label={t('nameAr')}
        lang="ar"
        dir="rtl"
        error={fieldError(errors.nameAr?.message)}
        {...form.form.register('nameAr')}
      />
      <TextField
        label={t('nameEn')}
        lang="en"
        dir="ltr"
        error={fieldError(errors.nameEn?.message)}
        {...form.form.register('nameEn')}
      />
      <TextField
        label={t('tradeLicenseNo')}
        dir="ltr"
        error={fieldError(errors.tradeLicenseNo?.message)}
        {...form.form.register('tradeLicenseNo')}
      />
      <TextField
        label={t('contactEmail')}
        type="email"
        dir="ltr"
        error={fieldError(errors.contactEmail?.message)}
        {...form.form.register('contactEmail')}
      />
      <TextField
        label={t('contactPhone')}
        type="tel"
        dir="ltr"
        hint={phoneHint}
        error={fieldError(errors.contactPhone?.message)}
        {...form.form.register('contactPhone')}
      />
    </ApiForm>
  );
}

// ---------------------------------------------------------------- details (FR-ADM-01, FR-ADM-02)

/** FR-ADM-01, FR-ADM-02, UC-06.1, UC-06.2: one agency, its status and its Agency Admin invitations. */
export function AgencyDetailScreen({ agencyId }: { agencyId: string }) {
  return (
    <AuthGate roles={PLATFORM_ADMIN} wide>
      {() => <AgencyDetail agencyId={agencyId} />}
    </AuthGate>
  );
}

function AgencyDetail({ agencyId }: { agencyId: string }) {
  const t = useTranslations('admin.agencies');
  const api = useApi();
  const path = `/admin/agencies/${agencyId}`;
  const agency = useQuery({
    queryKey: ['item', path],
    queryFn: () => api.get<Agency>(path, { schema: agencySchema }),
  });
  return (
    <>
      <p>
        <Link href="/agencies">{t('back')}</Link>
      </p>
      <LoadState
        pending={agency.isPending}
        error={agency.error}
        onRetry={() => void agency.refetch()}
      >
        {agency.data && (
          <>
            <h1>
              <span lang="en">{agency.data.nameEn}</span> ·{' '}
              <span lang="ar">{agency.data.nameAr}</span>
            </h1>
            <div className="reih-stack">
              <StatusSection agency={agency.data} />
              <section className="reih-card" aria-labelledby="agency-edit-title">
                <h2 id="agency-edit-title">{t('details')}</h2>
                <AgencyForm mode="edit" agency={agency.data} onDone={() => undefined} />
              </section>
              <AdminInvitations agency={agency.data} />
            </div>
          </>
        )}
      </LoadState>
    </>
  );
}

function StatusSection({ agency }: { agency: Agency }) {
  const t = useTranslations('admin.agencies');
  const api = useApi();
  const refresh = useRefreshLists();
  const [open, setOpen] = useState(false);
  const action = agency.status === 'active' ? 'suspend' : 'reactivate';
  return (
    <section className="reih-card" aria-labelledby="agency-status-title">
      <h2 id="agency-status-title">{t('statusTitle')}</h2>
      <dl className="reih-details">
        <dt>{t('columns.status')}</dt>
        <dd>
          <AgencyStatusBadge status={agency.status} />
        </dd>
        {agency.statusReason && (
          <>
            <dt>{t('reason')}</dt>
            <dd>{agency.statusReason}</dd>
            <dt>{t('changedAt')}</dt>
            <dd>
              <DateTime iso={agency.statusChangedAt} />
            </dd>
          </>
        )}
      </dl>
      {agency.status === 'active' && <p className="reih-hint">{t('suspendHint')}</p>}
      <div className="reih-actions">
        <button
          type="button"
          className={action === 'suspend' ? 'reih-danger' : 'reih-primary'}
          onClick={() => setOpen(true)}
        >
          {t(action)}
        </button>
      </div>
      <ReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title={t(`${action}Title`)}
        description={t.rich(`${action}Body`, { name: agency.nameEn, ...richTags })}
        confirmLabel={t(action)}
        onSubmit={async (reason) => {
          await api.post(`/admin/agencies/${agency.id}/${action}`, { body: { reason } });
          await refresh(`/admin/agencies`);
        }}
      />
    </section>
  );
}

function AdminInvitations({ agency }: { agency: Agency }) {
  const t = useTranslations('admin.agencies.invite');
  const tInv = useTranslations('invitations');
  const tDialog = useTranslations('dialog');
  const tCommon = useTranslations('common');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const listPath = `/admin/agencies/${agency.id}/invitations`;
  const form = useApiForm(inviteAgencyAdminRequestSchema, {
    defaultValues: { email: '', language: undefined },
    onSubmit: async (values) => {
      await api.post(listPath, { body: values });
      await refresh(listPath);
      form.form.reset({ email: '', language: undefined });
      return t.rich('sent', { email: values.email, ...richTags }) as ReactNode;
    },
  });
  const { errors } = form.form.formState;
  return (
    <section className="reih-card" aria-labelledby="agency-invite-title">
      <h2 id="agency-invite-title">{t('title')}</h2>
      {agency.status === 'suspended' && <p className="reih-hint">{t('suspendedHint')}</p>}
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
      <InvitationsTable
        caption={t('pending')}
        listPath={listPath}
        actionBase="/admin/invitations"
        empty={t('empty')}
      />
    </section>
  );
}
