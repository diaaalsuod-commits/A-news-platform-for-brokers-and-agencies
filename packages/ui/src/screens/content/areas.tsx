'use client';

import {
  type Area,
  type AreaLevel,
  areaSchema,
  createAreaRequestSchema,
  updateAreaRequestSchema,
} from '@reih/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useApi, useErrorText } from '../../api/hooks';
import { useFullList, useRefreshLists } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { ConfirmDialog, Dialog } from '../../dialog';
import {
  ApiForm,
  CheckboxField,
  FieldPair,
  SelectField,
  TextAreaField,
  TextField,
  useApiForm,
  useFieldErrorText,
} from '../../forms';
import { localName } from '../../names';
import { AuthGate } from '../../shell';
import { Tabs } from '../../tabs';
import { Ltr, richTags } from '../../text';
import { LocationFields } from './location-fields';
import { ActiveBadge, DATA_OPERATOR } from './parts';

const PATH = '/content/areas';
const LEVELS: readonly AreaLevel[] = ['emirate', 'community'];

/** A community names its emirate; the API checks it again (FR-DAT-03). */
const createSchema = createAreaRequestSchema.refine(
  (value) => value.level !== 'community' || Boolean(value.parentId),
  { path: ['parentId'], message: 'validation.required' },
);

/**
 * FR-DAT-03, FR-LOC-04, UC-05.3: emirates and their communities, each with Arabic and English
 * names and descriptions and a center point inside the UAE. The UAE is the only market (v1.0).
 */
export function AreasScreen() {
  const t = useTranslations('content.areas');
  const [level, setLevel] = useState<AreaLevel>('emirate');
  return (
    <AuthGate roles={DATA_OPERATOR} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <p>{t.rich('country', richTags)}</p>
          <Tabs
            label={t('title')}
            selected={level}
            onSelect={(id) => setLevel(id as AreaLevel)}
            tabs={LEVELS.map((id) => ({
              id,
              label: t(`tabs.${id}`),
              content: <AreaTab key={id} level={id} />,
            }))}
          />
        </>
      )}
    </AuthGate>
  );
}

type Pending =
  { kind: 'create' } | { kind: 'edit'; area: Area } | { kind: 'delete'; area: Area } | null;

function AreaTab({ level }: { level: AreaLevel }) {
  const t = useTranslations('content.areas');
  const tCommon = useTranslations('content.common');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const errorText = useErrorText();
  const emirates = useFullList<Area>(PATH, { level: 'emirate' });
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [draft, setDraft] = useState({ q: '', active: '', parentId: '' });
  const [pending, setPending] = useState<Pending>(null);
  const [toggleError, setToggleError] = useState<unknown>(null);
  const list = useFullList<Area>(PATH, { level, ...filters });
  const emirateName = (id: string | null) => {
    const emirate = emirates.data?.find((candidate) => candidate.id === id);
    return emirate ? localName(emirate, locale) : '';
  };

  const toggle = async (area: Area) => {
    setToggleError(null);
    try {
      await api.patch(`${PATH}/${area.id}`, { body: { isActive: !area.isActive } });
      await refresh(PATH);
    } catch (error) {
      setToggleError(error);
    }
  };

  const columns: Column<Area>[] = [
    {
      key: 'nameEn',
      header: tCommon('nameEn'),
      cell: (row) => <span lang="en">{row.nameEn}</span>,
      sortValue: (row) => row.nameEn,
    },
    {
      key: 'nameAr',
      header: tCommon('nameAr'),
      cell: (row) => <span lang="ar">{row.nameAr}</span>,
      sortValue: (row) => row.nameAr,
    },
    ...(level === 'community'
      ? [
          {
            key: 'emirate',
            header: t('columns.emirate'),
            cell: (row: Area) => emirateName(row.parentId),
            sortValue: (row: Area) => emirateName(row.parentId),
          },
        ]
      : []),
    {
      key: 'center',
      header: t('columns.center'),
      cell: (row) => (
        <Ltr>
          {row.center.lng}, {row.center.lat}
        </Ltr>
      ),
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
          <button type="button" onClick={() => setPending({ kind: 'edit', area: row })}>
            {tCommon('edit')}
          </button>
          <button type="button" onClick={() => void toggle(row)}>
            {row.isActive ? tCommon('deactivate') : tCommon('activate')}
          </button>
          <button type="button" onClick={() => setPending({ kind: 'delete', area: row })}>
            {tCommon('delete')}
          </button>
        </div>
      ),
    },
  ];

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFilters({
      q: draft.q || undefined,
      active: draft.active || undefined,
      parentId: draft.parentId || undefined,
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
        {level === 'community' && (
          <SelectField
            label={t('columns.emirate')}
            value={draft.parentId}
            onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
          >
            <option value="">{t('allEmirates')}</option>
            {(emirates.data ?? []).map((emirate) => (
              <option key={emirate.id} value={emirate.id}>
                {localName(emirate, locale)}
              </option>
            ))}
          </SelectField>
        )}
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
          {t(`new.${level}`)}
        </button>
      </form>
      {toggleError !== null && (
        <div role="alert" className="reih-alert" data-tone="error">
          {errorText(toggleError)}
        </div>
      )}
      <DataTable
        caption={t(`tabs.${level}`)}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={filtered ? t('noMatch') : t(`empty.${level}`)}
        initialSort={{ key: 'nameEn', direction: 'asc' }}
      />
      <Dialog
        open={pending?.kind === 'create' || pending?.kind === 'edit'}
        onClose={() => setPending(null)}
        title={pending?.kind === 'edit' ? t(`editTitle.${level}`) : t(`new.${level}`)}
        wide
      >
        {(pending?.kind === 'create' || pending?.kind === 'edit') && (
          <AreaForm
            level={level}
            area={pending.kind === 'edit' ? pending.area : undefined}
            emirates={emirates.data ?? []}
            onDone={() => setPending(null)}
            onCancel={() => setPending(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        onClose={() => setPending(null)}
        title={t('deleteTitle')}
        body={t.rich('deleteBody', {
          name: pending?.kind === 'delete' ? localName(pending.area, locale) : '',
          ...richTags,
        })}
        confirmLabel={tCommon('delete')}
        danger
        onConfirm={async () => {
          if (pending?.kind !== 'delete') return;
          await api.delete(`${PATH}/${pending.area.id}`);
          await refresh(PATH);
        }}
      />
    </>
  );
}

/**
 * FR-DAT-03: names and descriptions in both languages and a center point, typed as longitude and
 * latitude (the keyboard way) or picked on the map (P4.4 part b); the API refuses a point outside
 * the UAE.
 */
function AreaForm({
  level,
  area,
  emirates,
  onDone,
  onCancel,
}: {
  level: AreaLevel;
  area?: Area;
  emirates: readonly Area[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('content.areas');
  const tCommon = useTranslations('content.common');
  const tDialog = useTranslations('dialog');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const schema = area ? updateAreaRequestSchema : createSchema;
  const form = useApiForm(schema, {
    defaultValues: {
      ...(area ? {} : { level }),
      ...(level === 'community' ? { parentId: area?.parentId ?? '' } : {}),
      nameAr: area?.nameAr ?? '',
      nameEn: area?.nameEn ?? '',
      descriptionAr: area?.descriptionAr ?? '',
      descriptionEn: area?.descriptionEn ?? '',
      center: { lng: area?.center.lng, lat: area?.center.lat },
      isActive: area?.isActive ?? true,
    } as never,
    onSubmit: async (values) => {
      if (area) {
        await api.patch(`${PATH}/${area.id}`, { body: values, schema: areaSchema });
      } else {
        await api.post(PATH, { body: values, schema: areaSchema });
      }
      await refresh(PATH);
      onDone();
    },
  });
  // The fields differ by level, so they are reached by name.
  const register = form.form.register as unknown as (
    name: string,
    options?: { setValueAs?: (value: unknown) => unknown },
  ) => ReturnType<typeof form.form.register>;
  const errors = form.form.formState.errors as Record<string, { message?: string } | undefined>;
  // An inactive emirate is offered only when it is the community's own.
  const choices = emirates.filter((emirate) => emirate.isActive || emirate.id === area?.parentId);

  return (
    <ApiForm
      api={form}
      submitLabel={area ? tCommon('save') : t(`create.${level}`)}
      pendingLabel={tDialog('working')}
      secondary={
        <button type="button" onClick={onCancel}>
          {tDialog('cancel')}
        </button>
      }
    >
      {level === 'community' && (
        <SelectField
          label={t('columns.emirate')}
          error={fieldError(errors.parentId?.message)}
          {...register('parentId', { setValueAs: (value) => value || undefined })}
        >
          <option value="">{t('chooseEmirate')}</option>
          {choices.map((emirate) => (
            <option key={emirate.id} value={emirate.id}>
              {localName(emirate, locale)}
              {emirate.isActive ? '' : ` ${t('inactiveMark')}`}
            </option>
          ))}
        </SelectField>
      )}
      <FieldPair>
        <TextField
          label={tCommon('nameAr')}
          lang="ar"
          dir="rtl"
          error={fieldError(errors.nameAr?.message)}
          {...register('nameAr')}
        />
        <TextField
          label={tCommon('nameEn')}
          lang="en"
          dir="ltr"
          error={fieldError(errors.nameEn?.message)}
          {...register('nameEn')}
        />
      </FieldPair>
      <FieldPair>
        <TextAreaField
          label={tCommon('descriptionAr')}
          lang="ar"
          dir="rtl"
          hint={tCommon('descriptionHint')}
          error={fieldError(errors.descriptionAr?.message)}
          {...register('descriptionAr')}
        />
        <TextAreaField
          label={tCommon('descriptionEn')}
          lang="en"
          dir="ltr"
          hint={tCommon('descriptionHint')}
          error={fieldError(errors.descriptionEn?.message)}
          {...register('descriptionEn')}
        />
      </FieldPair>
      <LocationFields
        form={form.form}
        name="center"
        legend={t('center')}
        hint={t.rich('centerHint', richTags)}
        lngLabel={t('lng')}
        latLabel={t('lat')}
        mapLabel={t('centerMap')}
      />
      <CheckboxField label={tCommon('activeField')} {...register('isActive')} />
    </ApiForm>
  );
}
