'use client';

import {
  createDeveloperRequestSchema,
  type Developer,
  DEVELOPER_LOGO_MAX_BYTES,
  developerLogoField,
  developerSchema,
  updateDeveloperRequestSchema,
} from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useApi } from '../../api/hooks';
import { useFullList, useRefreshLists } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { ConfirmDialog, Dialog } from '../../dialog';
import {
  ApiForm,
  FieldPair,
  SelectField,
  TextAreaField,
  TextField,
  useApiForm,
  useFieldErrorText,
} from '../../forms';
import { localName } from '../../names';
import { Link, useRouter } from '../../navigation';
import { AuthGate, LoadState } from '../../shell';
import { Ltr, richTags } from '../../text';
import { LogoUpload } from '../logo-upload';
import { DateTime } from '../parts';
import { DATA_OPERATOR, RecordStatusBadge } from './parts';

const PATH = '/content/developers';

// ---------------------------------------------------------------- list (FR-DAT-01, UC-05.1)

/** FR-DAT-01, UC-05.1: every developer, with search, a status filter and "New developer". */
export function DevelopersScreen() {
  const t = useTranslations('content.developers');
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <DeveloperList />
        </>
      )}
    </AuthGate>
  );
}

function DeveloperList() {
  const t = useTranslations('content.developers');
  const tCommon = useTranslations('content.common');
  const router = useRouter();
  const [filters, setFilters] = useState<{ q?: string; status?: string }>({});
  const [draft, setDraft] = useState({ q: '', status: '' });
  const [creating, setCreating] = useState(false);
  const list = useFullList<Developer>(PATH, filters);

  const columns: Column<Developer>[] = [
    {
      key: 'nameEn',
      header: tCommon('nameEn'),
      cell: (row) => (
        <Link href={`/developers/${row.id}`}>
          <span lang="en">{row.nameEn}</span>
        </Link>
      ),
      sortValue: (row) => row.nameEn,
    },
    {
      key: 'nameAr',
      header: tCommon('nameAr'),
      cell: (row) => <span lang="ar">{row.nameAr}</span>,
      sortValue: (row) => row.nameAr,
    },
    {
      key: 'website',
      header: t('columns.website'),
      cell: (row) => (row.website ? <Ltr>{row.website}</Ltr> : <span aria-hidden="true">—</span>),
      sortValue: (row) => row.website,
    },
    {
      key: 'status',
      header: tCommon('status'),
      cell: (row) => <RecordStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
    {
      key: 'updated',
      header: tCommon('updated'),
      cell: (row) => <DateTime iso={row.updatedAt} />,
      sortValue: (row) => new Date(row.updatedAt),
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
          label={tCommon('status')}
          value={draft.status}
          onChange={(event) => setDraft({ ...draft, status: event.target.value })}
        >
          <option value="">{tCommon('all')}</option>
          <option value="active">{tCommon('active')}</option>
          <option value="archived">{tCommon('archived')}</option>
        </SelectField>
        <button type="submit">{tCommon('apply')}</button>
        <button type="button" className="reih-primary" onClick={() => setCreating(true)}>
          {t('new')}
        </button>
      </form>
      <DataTable
        caption={t('title')}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={filters.q || filters.status ? t('noMatch') : t('empty')}
        initialSort={{ key: 'nameEn', direction: 'asc' }}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title={t('new')} wide>
        <DeveloperForm
          onDone={(developer) => {
            setCreating(false);
            router.push(`/developers/${developer.id}`);
          }}
          onCancel={() => setCreating(false)}
        />
      </Dialog>
    </>
  );
}

/** FR-DAT-01: Arabic and English names (both required), descriptions and an https website. */
function DeveloperForm({
  developer,
  onDone,
  onCancel,
}: {
  developer?: Developer;
  onDone: (developer: Developer) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('content.developers');
  const tCommon = useTranslations('content.common');
  const tDialog = useTranslations('dialog');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(developer ? updateDeveloperRequestSchema : createDeveloperRequestSchema, {
    defaultValues: {
      nameAr: developer?.nameAr ?? '',
      nameEn: developer?.nameEn ?? '',
      descriptionAr: developer?.descriptionAr ?? '',
      descriptionEn: developer?.descriptionEn ?? '',
      website: developer?.website ?? '',
    },
    onSubmit: async (values) => {
      const saved = developer
        ? await api.patch<Developer>(`${PATH}/${developer.id}`, {
            body: values,
            schema: developerSchema,
          })
        : await api.post<Developer>(PATH, { body: values, schema: developerSchema });
      await refresh(PATH);
      onDone(saved);
      return developer ? t('saved') : undefined;
    },
  });
  const { errors } = form.form.formState;
  return (
    <ApiForm
      api={form}
      submitLabel={developer ? tCommon('save') : t('create')}
      pendingLabel={tDialog('working')}
      secondary={
        onCancel && (
          <button type="button" onClick={onCancel}>
            {tDialog('cancel')}
          </button>
        )
      }
    >
      <FieldPair>
        <TextField
          label={tCommon('nameAr')}
          lang="ar"
          dir="rtl"
          error={fieldError(errors.nameAr?.message)}
          {...form.form.register('nameAr')}
        />
        <TextField
          label={tCommon('nameEn')}
          lang="en"
          dir="ltr"
          error={fieldError(errors.nameEn?.message)}
          {...form.form.register('nameEn')}
        />
      </FieldPair>
      <FieldPair>
        <TextAreaField
          label={tCommon('descriptionAr')}
          lang="ar"
          dir="rtl"
          hint={tCommon('descriptionHint')}
          error={fieldError(errors.descriptionAr?.message)}
          {...form.form.register('descriptionAr')}
        />
        <TextAreaField
          label={tCommon('descriptionEn')}
          lang="en"
          dir="ltr"
          hint={tCommon('descriptionHint')}
          error={fieldError(errors.descriptionEn?.message)}
          {...form.form.register('descriptionEn')}
        />
      </FieldPair>
      <TextField
        label={t('website')}
        type="url"
        dir="ltr"
        hint={t.rich('websiteHint', richTags)}
        error={fieldError(errors.website?.message)}
        {...form.form.register('website')}
      />
    </ApiForm>
  );
}

// ---------------------------------------------------------------- one developer

/** FR-DAT-01, UC-05.1: one developer: details, logo, archive or restore, delete. */
export function DeveloperDetailScreen({ developerId }: { developerId: string }) {
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => <DeveloperDetail developerId={developerId} />}
    </AuthGate>
  );
}

function DeveloperDetail({ developerId }: { developerId: string }) {
  const t = useTranslations('content.developers');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const path = `${PATH}/${developerId}`;
  const developer = useQuery({
    queryKey: ['item', path],
    queryFn: () => api.get<Developer>(path, { schema: developerSchema }),
  });
  return (
    <>
      <p>
        <Link href="/developers">{t('back')}</Link>
      </p>
      <LoadState
        pending={developer.isPending}
        error={developer.error}
        onRetry={() => void developer.refetch()}
      >
        {developer.data && (
          <>
            <h1>{localName(developer.data, locale)}</h1>
            <div className="reih-stack">
              <StatusSection developer={developer.data} />
              <section className="reih-card" aria-labelledby="developer-edit-title">
                <h2 id="developer-edit-title">{t('details')}</h2>
                <DeveloperForm developer={developer.data} onDone={() => undefined} />
              </section>
              <section className="reih-card" aria-labelledby="developer-logo-title">
                <h2 id="developer-logo-title">{t('logoPreview')}</h2>
                {developer.data.logoUrl ? (
                  // A plain <img>: the API serves the logo behind the session, from the same origin.
                  <img
                    className="reih-logo-preview"
                    src={developer.data.logoUrl}
                    alt={t('logoAlt', { name: localName(developer.data, locale) })}
                  />
                ) : (
                  <p className="reih-muted">{t('noLogo')}</p>
                )}
              </section>
              <LogoUpload
                messages="content.developers.logo"
                path={`${path}/logo`}
                field={developerLogoField}
                maxBytes={DEVELOPER_LOGO_MAX_BYTES}
                hasLogo={developer.data.logoUrl !== null}
                onChanged={() => refresh(PATH)}
              />
            </div>
          </>
        )}
      </LoadState>
    </>
  );
}

function StatusSection({ developer }: { developer: Developer }) {
  const t = useTranslations('content.developers');
  const tCommon = useTranslations('content.common');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const router = useRouter();
  const [pending, setPending] = useState<'status' | 'delete' | null>(null);
  const archived = developer.status === 'archived';
  const name = localName(developer, locale);
  return (
    <section className="reih-card" aria-labelledby="developer-status-title">
      <h2 id="developer-status-title">{tCommon('status')}</h2>
      <p>
        <RecordStatusBadge status={developer.status} />
      </p>
      <p className="reih-hint">{archived ? t('restoreHint') : t('archiveHint')}</p>
      <div className="reih-actions">
        <button
          type="button"
          className={archived ? 'reih-primary' : undefined}
          onClick={() => setPending('status')}
        >
          {archived ? t('restore') : t('archive')}
        </button>
        <button type="button" className="reih-danger" onClick={() => setPending('delete')}>
          {tCommon('delete')}
        </button>
      </div>
      <ConfirmDialog
        open={pending === 'status'}
        onClose={() => setPending(null)}
        title={archived ? t('restoreTitle') : t('archiveTitle')}
        body={t.rich(archived ? 'restoreBody' : 'archiveBody', { name, ...richTags })}
        confirmLabel={archived ? t('restore') : t('archive')}
        onConfirm={async () => {
          await api.patch(`${PATH}/${developer.id}`, {
            body: { status: archived ? 'active' : 'archived' },
          });
          await refresh(PATH);
        }}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onClose={() => setPending(null)}
        title={t('deleteTitle')}
        body={t.rich('deleteBody', { name, ...richTags })}
        confirmLabel={tCommon('delete')}
        danger
        onConfirm={async () => {
          await api.delete(`${PATH}/${developer.id}`);
          // Leave first, so the deleted developer is not read again on this page.
          router.push('/developers');
          void refresh(PATH);
        }}
      />
    </section>
  );
}
