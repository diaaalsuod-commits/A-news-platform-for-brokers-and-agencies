'use client';

import {
  contactLanguagesSchema,
  createSalesContactRequestSchema,
  type Developer,
  type ProjectSummary,
  type SalesContact,
  type SalesContactDetail,
  salesContactDetailSchema,
  updateSalesContactRequestSchema,
} from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { z } from 'zod';
import { useApi, useErrorText } from '../../api/hooks';
import { useFullList, useRefreshLists } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { Dialog } from '../../dialog';
import {
  ApiForm,
  CheckboxField,
  FieldPair,
  SelectField,
  TextField,
  useApiForm,
  useFieldErrorText,
} from '../../forms';
import { uaeToday } from '../../format';
import { formatLanguageList, parseLanguageList } from '../../language-list';
import { localName } from '../../names';
import { AuthGate, LoadState } from '../../shell';
import { Ltr, richTags } from '../../text';
import { ActiveBadge, DATA_OPERATOR } from './parts';

const PATH = '/content/sales-contacts';

/**
 * The contracts schema with what the screen adds: the languages are typed on one line, and the
 * verification date is no later than today in the UAE (the API checks both again).
 */
function contactFormSchema<S extends z.ZodObject>(schema: S) {
  return schema
    .extend({ languages: z.preprocess(parseLanguageList, contactLanguagesSchema).optional() })
    .refine(
      (value: { verifiedAt?: string | null }) =>
        !value.verifiedAt || value.verifiedAt <= uaeToday(),
      { path: ['verifiedAt'], message: 'validation.dateInFuture' },
    );
}

const createSchema = contactFormSchema(createSalesContactRequestSchema);
const updateSchema = contactFormSchema(updateSalesContactRequestSchema);

type Pending = { kind: 'create' } | { kind: 'edit'; id: string } | null;

/** FR-DAT-02, UC-05.2: sales contacts, their developer, languages, verification and projects. */
export function SalesContactsScreen() {
  const t = useTranslations('content.contacts');
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <p className="reih-hint">{t('intro')}</p>
          <ContactList />
        </>
      )}
    </AuthGate>
  );
}

function ContactList() {
  const t = useTranslations('content.contacts');
  const tCommon = useTranslations('content.common');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const errorText = useErrorText();
  const developers = useFullList<Developer>('/content/developers');
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [draft, setDraft] = useState({ q: '', developerId: '', active: '' });
  const [pending, setPending] = useState<Pending>(null);
  const [toggleError, setToggleError] = useState<unknown>(null);
  const list = useFullList<SalesContact>(PATH, filters);

  const toggle = async (contact: SalesContact) => {
    setToggleError(null);
    try {
      await api.patch(`${PATH}/${contact.id}`, { body: { isActive: !contact.isActive } });
      await refresh(PATH);
    } catch (error) {
      setToggleError(error);
    }
  };

  const columns: Column<SalesContact>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      cell: (row) => (
        <>
          <span dir="auto">{row.fullName}</span>
          {row.title && (
            <>
              <br />
              <span className="reih-muted" dir="auto">
                {row.title}
              </span>
            </>
          )}
        </>
      ),
      sortValue: (row) => row.fullName,
    },
    {
      key: 'developer',
      header: t('columns.developer'),
      cell: (row) => localName(row.developer, locale),
      sortValue: (row) => localName(row.developer, locale),
    },
    {
      key: 'phone',
      header: t('columns.phone'),
      cell: (row) => <Ltr>{row.phone}</Ltr>,
      sortValue: (row) => row.phone,
    },
    {
      key: 'languages',
      header: t('columns.languages'),
      cell: (row) => <Ltr>{formatLanguageList(row.languages)}</Ltr>,
    },
    {
      key: 'verified',
      header: t('columns.verified'),
      cell: (row) =>
        row.verifiedAt ? <Ltr>{row.verifiedAt}</Ltr> : <span aria-hidden="true">—</span>,
      sortValue: (row) => row.verifiedAt,
    },
    {
      key: 'projects',
      header: t('columns.projects'),
      cell: (row) => <Ltr>{row.projectCount}</Ltr>,
      sortValue: (row) => row.projectCount,
    },
    {
      key: 'active',
      header: tCommon('status'),
      cell: (row) => <ActiveBadge active={row.isActive} />,
      sortValue: (row) => row.isActive,
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      cell: (row) => (
        <div className="reih-row-actions">
          <button type="button" onClick={() => setPending({ kind: 'edit', id: row.id })}>
            {tCommon('edit')}
          </button>
          <button type="button" onClick={() => void toggle(row)}>
            {row.isActive ? tCommon('deactivate') : tCommon('activate')}
          </button>
        </div>
      ),
    },
  ];

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFilters({
      q: draft.q || undefined,
      developerId: draft.developerId || undefined,
      active: draft.active || undefined,
    });
  };
  const filtered = Object.values(filters).some(Boolean);

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
          label={t('columns.developer')}
          value={draft.developerId}
          onChange={(event) => setDraft({ ...draft, developerId: event.target.value })}
        >
          <option value="">{t('allDevelopers')}</option>
          {(developers.data ?? []).map((developer) => (
            <option key={developer.id} value={developer.id}>
              {localName(developer, locale)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={tCommon('status')}
          value={draft.active}
          onChange={(event) => setDraft({ ...draft, active: event.target.value })}
        >
          <option value="">{tCommon('all')}</option>
          <option value="true">{tCommon('active')}</option>
          <option value="false">{tCommon('inactive')}</option>
        </SelectField>
        <button type="submit">{tCommon('apply')}</button>
        <button
          type="button"
          className="reih-primary"
          onClick={() => setPending({ kind: 'create' })}
        >
          {t('new')}
        </button>
      </form>
      {toggleError !== null && (
        <div role="alert" className="reih-alert" data-tone="error">
          {errorText(toggleError)}
        </div>
      )}
      <DataTable
        caption={t('title')}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={filtered ? t('noMatch') : t('empty')}
        initialSort={{ key: 'name', direction: 'asc' }}
      />
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.kind === 'edit' ? t('editTitle') : t('new')}
        wide
      >
        {pending?.kind === 'create' && (
          <ContactForm
            developers={developers.data ?? []}
            onDone={() => setPending(null)}
            onCancel={() => setPending(null)}
          />
        )}
        {pending?.kind === 'edit' && (
          <EditContact
            id={pending.id}
            developers={developers.data ?? []}
            onDone={() => setPending(null)}
            onCancel={() => setPending(null)}
          />
        )}
      </Dialog>
    </>
  );
}

/** One contact with its assigned projects, which the list does not carry. */
function EditContact({
  id,
  developers,
  onDone,
  onCancel,
}: {
  id: string;
  developers: readonly Developer[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const path = `${PATH}/${id}`;
  const contact = useQuery({
    queryKey: ['item', path],
    queryFn: () => api.get<SalesContactDetail>(path, { schema: salesContactDetailSchema }),
  });
  return (
    <LoadState
      pending={contact.isPending}
      error={contact.error}
      onRetry={() => void contact.refetch()}
    >
      {contact.data && (
        <ContactForm
          contact={contact.data}
          developers={developers}
          onDone={onDone}
          onCancel={onCancel}
        />
      )}
    </LoadState>
  );
}

/**
 * FR-DAT-02: a contact belongs to one developer and is assigned only to that developer's projects,
 * so choosing another developer clears the assignments (the API accepts the developer and a
 * matching set of projects in one request).
 */
function ContactForm({
  contact,
  developers,
  onDone,
  onCancel,
}: {
  contact?: SalesContactDetail;
  developers: readonly Developer[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('content.contacts');
  const tCommon = useTranslations('content.common');
  const tDialog = useTranslations('dialog');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(contact ? updateSchema : createSchema, {
    defaultValues: {
      developerId: contact?.developer.id ?? '',
      fullName: contact?.fullName ?? '',
      title: contact?.title ?? '',
      phone: contact?.phone ?? '',
      whatsapp: contact?.whatsapp ?? '',
      email: contact?.email ?? '',
      languages: formatLanguageList(contact?.languages ?? []),
      verifiedAt: contact?.verifiedAt ?? '',
      verificationSource: contact?.verificationSource ?? '',
      isActive: contact?.isActive ?? true,
      projectIds: contact?.projects.map((project) => project.id) ?? [],
    },
    onSubmit: async (values) => {
      if (contact) {
        await api.patch(`${PATH}/${contact.id}`, { body: values });
      } else {
        await api.post(PATH, { body: values });
      }
      await refresh(PATH);
      onDone();
    },
  });
  const { register, setValue, watch } = form.form;
  const { errors } = form.form.formState;
  const developerId = String(watch('developerId') ?? '');
  const projectIds = (watch('projectIds') ?? []) as string[];
  const projects = useFullList<ProjectSummary>(
    '/content/projects',
    { developerId },
    { enabled: developerId !== '' },
  );
  // An archived developer is offered only when it is the contact's own.
  const choices = developers.filter(
    (developer) => developer.status === 'active' || developer.id === contact?.developer.id,
  );
  const phoneHint = t.rich('phoneHint', richTags);
  // A wrong code is reported on its item (languages.1); the field shows the first one.
  const languageErrors = errors.languages as
    ({ message?: string } & ({ message?: string } | undefined)[]) | undefined;
  const languagesError =
    languageErrors?.message ??
    (Array.isArray(languageErrors)
      ? languageErrors.find((item) => item?.message)?.message
      : undefined);
  const toggleProject = (id: string, checked: boolean) =>
    setValue(
      'projectIds',
      checked ? [...projectIds, id] : projectIds.filter((candidate) => candidate !== id),
      { shouldDirty: true },
    );

  return (
    <ApiForm
      api={form}
      submitLabel={contact ? tCommon('save') : t('create')}
      pendingLabel={tDialog('working')}
      secondary={
        <button type="button" onClick={onCancel}>
          {tDialog('cancel')}
        </button>
      }
    >
      <SelectField
        label={t('form.developer')}
        error={fieldError(errors.developerId?.message)}
        {...register('developerId', {
          onChange: () => setValue('projectIds', [], { shouldDirty: true }),
        })}
      >
        <option value="">{t('form.chooseDeveloper')}</option>
        {choices.map((developer) => (
          <option key={developer.id} value={developer.id}>
            {localName(developer, locale)}
            {developer.status === 'archived' ? ` ${t('form.archived')}` : ''}
          </option>
        ))}
      </SelectField>
      <FieldPair>
        <TextField
          label={t('form.fullName')}
          dir="auto"
          autoComplete="off"
          error={fieldError(errors.fullName?.message)}
          {...register('fullName')}
        />
        <TextField
          label={t('form.title')}
          dir="auto"
          error={fieldError(errors.title?.message)}
          {...register('title')}
        />
      </FieldPair>
      <FieldPair>
        <TextField
          label={t('form.phone')}
          type="tel"
          dir="ltr"
          autoComplete="off"
          hint={phoneHint}
          error={fieldError(errors.phone?.message)}
          {...register('phone')}
        />
        <TextField
          label={t('form.whatsapp')}
          type="tel"
          dir="ltr"
          autoComplete="off"
          hint={phoneHint}
          error={fieldError(errors.whatsapp?.message)}
          {...register('whatsapp')}
        />
      </FieldPair>
      <FieldPair>
        <TextField
          label={t('form.email')}
          type="email"
          dir="ltr"
          autoComplete="off"
          error={fieldError(errors.email?.message)}
          {...register('email')}
        />
        <TextField
          label={t('form.languages')}
          dir="ltr"
          hint={t.rich('form.languagesHint', richTags)}
          error={fieldError(languagesError)}
          {...register('languages')}
        />
      </FieldPair>
      <FieldPair>
        <TextField
          label={t('form.verifiedAt')}
          type="date"
          dir="ltr"
          max={uaeToday()}
          hint={t('form.verificationHint')}
          error={fieldError(errors.verifiedAt?.message)}
          {...register('verifiedAt')}
        />
        <TextField
          label={t('form.verificationSource')}
          dir="auto"
          error={fieldError(errors.verificationSource?.message)}
          {...register('verificationSource')}
        />
      </FieldPair>
      <CheckboxField label={t('form.isActive')} {...register('isActive')} />
      <fieldset
        className="reih-choice-list"
        aria-describedby="contact-projects-hint contact-projects-error"
      >
        <legend>{t('form.projects')}</legend>
        <p id="contact-projects-hint" className="reih-hint">
          {t('form.projectsHint')}
        </p>
        {developerId === '' ? (
          <p className="reih-muted">{t('form.projectsChooseDeveloper')}</p>
        ) : (
          <LoadState
            pending={projects.isPending}
            error={projects.error}
            onRetry={() => void projects.refetch()}
          >
            {(projects.data ?? []).length === 0 ? (
              <p role="status" className="reih-muted">
                {t('form.projectsNone')}
              </p>
            ) : (
              (projects.data ?? []).map((project) => (
                <CheckboxField
                  key={project.id}
                  label={`${localName(project, locale)}${
                    project.status === 'archived' ? ` ${t('form.archived')}` : ''
                  }`}
                  checked={projectIds.includes(project.id)}
                  onChange={(event) => toggleProject(project.id, event.target.checked)}
                />
              ))
            )}
          </LoadState>
        )}
        <p id="contact-projects-error" className="reih-field-error">
          {fieldError(errors.projectIds?.message)}
        </p>
      </fieldset>
    </ApiForm>
  );
}
