'use client';

import {
  AMENITY_ICON_KEYS,
  createReferenceRequestSchemas,
  type ReferenceItem,
  type ReferenceKind,
  referenceKindValues,
  updateReferenceRequestSchemas,
} from '@reih/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi, useErrorText } from '../../api/hooks';
import { useFullList, useRefreshLists } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { ConfirmDialog, Dialog } from '../../dialog';
import {
  ApiForm,
  CheckboxField,
  SelectField,
  TextField,
  useApiForm,
  useFieldErrorText,
} from '../../forms';
import { AuthGate } from '../../shell';
import { Tabs } from '../../tabs';
import { Ltr } from '../../text';

/** The fields a kind has, read from its request schema in packages/contracts. */
function fieldsOf(kind: ReferenceKind) {
  const shape = createReferenceRequestSchemas[kind].shape as Record<string, unknown>;
  return {
    code: 'code' in shape,
    sortOrder: 'sortOrder' in shape,
    bedrooms: 'bedrooms' in shape,
    icon: 'icon' in shape,
    category: 'categoryId' in shape,
  };
}

const PATH = (kind: ReferenceKind) => `/admin/reference/${kind}`;

/**
 * FR-ADM-04, UC-06.4: one tab per dictionary. An item in use cannot be deleted (REFERENCE_IN_USE);
 * it is deactivated instead, and then no longer offered in new selections.
 */
export function ReferenceDataScreen() {
  const t = useTranslations('admin.reference');
  const [kind, setKind] = useState<ReferenceKind>('property-types');
  return (
    <AuthGate roles={['platform_admin']} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <p className="reih-hint">{t('intro')}</p>
          <Tabs
            label={t('title')}
            selected={kind}
            onSelect={(id) => setKind(id as ReferenceKind)}
            tabs={referenceKindValues.map((id) => ({
              id,
              label: t(`kinds.${id}`),
              content: <ReferenceTab key={id} kind={id} />,
            }))}
          />
        </>
      )}
    </AuthGate>
  );
}

type Pending =
  | { kind: 'create' }
  | { kind: 'edit'; item: ReferenceItem }
  | { kind: 'delete'; item: ReferenceItem }
  | null;

function ReferenceTab({ kind }: { kind: ReferenceKind }) {
  const t = useTranslations('admin.reference');
  const locale = useLocale();
  const api = useApi();
  const refresh = useRefreshLists();
  const list = useFullList<ReferenceItem>(PATH(kind));
  const fields = fieldsOf(kind);
  const categories = useFullList<ReferenceItem>(PATH('amenity-categories'));
  const [pending, setPending] = useState<Pending>(null);
  const [toggleError, setToggleError] = useState<unknown>(null);
  const categoryName = (id: string | null) => {
    const category = categories.data?.find((item) => item.id === id);
    return category ? (locale === 'ar' ? category.nameAr : category.nameEn) : '';
  };

  const toggle = async (item: ReferenceItem) => {
    setToggleError(null);
    try {
      await api.patch(`${PATH(kind)}/${item.id}`, { body: { isActive: !item.isActive } });
      await refresh(PATH(kind));
    } catch (error) {
      setToggleError(error);
    }
  };

  const columns: Column<ReferenceItem>[] = [
    ...(fields.code
      ? [
          {
            key: 'code',
            header: t('columns.code'),
            cell: (row: ReferenceItem) => <Ltr>{row.code}</Ltr>,
            sortValue: (row: ReferenceItem) => row.code,
          },
        ]
      : []),
    {
      key: 'nameEn',
      header: t('columns.nameEn'),
      cell: (row) => <span lang="en">{row.nameEn}</span>,
      sortValue: (row) => row.nameEn,
    },
    {
      key: 'nameAr',
      header: t('columns.nameAr'),
      cell: (row) => <span lang="ar">{row.nameAr}</span>,
      sortValue: (row) => row.nameAr,
    },
    ...(fields.category
      ? [
          {
            key: 'category',
            header: t('columns.category'),
            cell: (row: ReferenceItem) => categoryName(row.categoryId),
            sortValue: (row: ReferenceItem) => categoryName(row.categoryId),
          },
        ]
      : []),
    ...(fields.bedrooms
      ? [
          {
            key: 'bedrooms',
            header: t('columns.bedrooms'),
            cell: (row: ReferenceItem) => <Ltr>{row.bedrooms}</Ltr>,
            sortValue: (row: ReferenceItem) => row.bedrooms,
          },
        ]
      : []),
    ...(fields.icon
      ? [
          {
            key: 'icon',
            header: t('columns.icon'),
            cell: (row: ReferenceItem) =>
              row.icon ? <code>{row.icon}</code> : <span aria-hidden="true">—</span>,
            sortValue: (row: ReferenceItem) => row.icon,
          },
        ]
      : []),
    ...(fields.sortOrder
      ? [
          {
            key: 'sortOrder',
            header: t('columns.sortOrder'),
            cell: (row: ReferenceItem) => <Ltr>{row.sortOrder}</Ltr>,
            sortValue: (row: ReferenceItem) => row.sortOrder,
          },
        ]
      : []),
    {
      key: 'active',
      header: t('columns.active'),
      cell: (row) => (
        <span className="reih-badge" data-tone={row.isActive ? 'success' : 'warning'}>
          {row.isActive ? t('active') : t('inactive')}
        </span>
      ),
      sortValue: (row) => row.isActive,
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (row) => (
        <div className="reih-row-actions">
          <button type="button" onClick={() => setPending({ kind: 'edit', item: row })}>
            {t('edit')}
          </button>
          <button type="button" onClick={() => void toggle(row)}>
            {row.isActive ? t('deactivate') : t('activate')}
          </button>
          <button type="button" onClick={() => setPending({ kind: 'delete', item: row })}>
            {t('delete')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="reih-toolbar">
        <button
          type="button"
          className="reih-primary"
          onClick={() => setPending({ kind: 'create' })}
        >
          {t('new')}
        </button>
      </div>
      {toggleError !== null && <ToggleError error={toggleError} />}
      <DataTable
        caption={t(`kinds.${kind}`)}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={t('empty')}
        initialSort={
          fields.sortOrder
            ? { key: 'sortOrder', direction: 'asc' }
            : { key: 'nameEn', direction: 'asc' }
        }
      />
      <Dialog
        open={pending?.kind === 'create' || pending?.kind === 'edit'}
        onClose={() => setPending(null)}
        title={pending?.kind === 'edit' ? t('editTitle') : t('newTitle')}
      >
        {(pending?.kind === 'create' || pending?.kind === 'edit') && (
          <ReferenceForm
            kind={kind}
            item={pending.kind === 'edit' ? pending.item : undefined}
            categories={categories.data ?? []}
            onDone={async () => {
              await refresh(PATH(kind));
              setPending(null);
            }}
            onCancel={() => setPending(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={pending?.kind === 'delete'}
        onClose={() => setPending(null)}
        title={t('deleteTitle')}
        body={t('deleteBody', {
          name:
            pending?.kind === 'delete'
              ? locale === 'ar'
                ? pending.item.nameAr
                : pending.item.nameEn
              : '',
        })}
        confirmLabel={t('delete')}
        danger
        onConfirm={async () => {
          if (pending?.kind !== 'delete') return;
          await api.delete(`${PATH(kind)}/${pending.item.id}`);
          await refresh(PATH(kind));
        }}
      />
    </>
  );
}

function ToggleError({ error }: { error: unknown }) {
  const errorText = useErrorText();
  return (
    <div role="alert" className="reih-alert" data-tone="error">
      {errorText(error)}
    </div>
  );
}

/** An empty number field is "not set"; anything else is a number for the schema to check. */
const asOptionalNumber = (value: unknown) =>
  value === '' || value === null || value === undefined ? undefined : Number(value);

function ReferenceForm({
  kind,
  item,
  categories,
  onDone,
  onCancel,
}: {
  kind: ReferenceKind;
  item?: ReferenceItem;
  categories: readonly ReferenceItem[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('admin.reference');
  const tDialog = useTranslations('dialog');
  const locale = useLocale();
  const api = useApi();
  const fieldError = useFieldErrorText();
  const fields = fieldsOf(kind);
  const schema = item ? updateReferenceRequestSchemas[kind] : createReferenceRequestSchemas[kind];
  const form = useApiForm(schema, {
    defaultValues: {
      ...(fields.code && !item ? { code: '' } : {}),
      nameAr: item?.nameAr ?? '',
      nameEn: item?.nameEn ?? '',
      ...(fields.sortOrder ? { sortOrder: item?.sortOrder ?? 0 } : {}),
      ...(fields.bedrooms ? { bedrooms: item?.bedrooms ?? undefined } : {}),
      ...(fields.icon ? { icon: item?.icon ?? null } : {}),
      ...(fields.category ? { categoryId: item?.categoryId ?? '' } : {}),
      isActive: item?.isActive ?? true,
    } as never,
    onSubmit: async (values) => {
      if (item) {
        await api.patch(`${PATH(kind)}/${item.id}`, { body: values });
      } else {
        await api.post(PATH(kind), { body: values });
      }
      await onDone();
    },
  });
  // The form's fields differ by kind, so they are reached by name.
  const register = form.form.register as unknown as (
    name: string,
    options?: { setValueAs?: (value: unknown) => unknown },
  ) => ReturnType<typeof form.form.register>;
  const errors = form.form.formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <ApiForm
      api={form}
      submitLabel={item ? t('save') : t('create')}
      pendingLabel={tDialog('working')}
      secondary={
        <button type="button" onClick={onCancel}>
          {tDialog('cancel')}
        </button>
      }
    >
      {fields.code && !item && (
        <TextField
          label={t('columns.code')}
          dir="ltr"
          hint={t('codeHint')}
          error={fieldError(errors.code?.message)}
          {...register('code')}
        />
      )}
      {fields.code && item && (
        <p className="reih-hint">
          {t('columns.code')}: <Ltr>{item.code}</Ltr> · {t('codeFixed')}
        </p>
      )}
      <TextField
        label={t('columns.nameAr')}
        lang="ar"
        dir="rtl"
        error={fieldError(errors.nameAr?.message)}
        {...register('nameAr')}
      />
      <TextField
        label={t('columns.nameEn')}
        lang="en"
        dir="ltr"
        error={fieldError(errors.nameEn?.message)}
        {...register('nameEn')}
      />
      {fields.category && (
        <SelectField
          label={t('columns.category')}
          error={fieldError(errors.categoryId?.message)}
          {...register('categoryId')}
        >
          <option value="">{t('chooseCategory')}</option>
          {categories
            .filter((category) => category.isActive || category.id === item?.categoryId)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {locale === 'ar' ? category.nameAr : category.nameEn}
              </option>
            ))}
        </SelectField>
      )}
      {fields.bedrooms && (
        <TextField
          label={t('columns.bedrooms')}
          type="number"
          min={0}
          max={20}
          dir="ltr"
          error={fieldError(errors.bedrooms?.message)}
          {...register('bedrooms', { setValueAs: asOptionalNumber })}
        />
      )}
      {fields.icon && (
        <SelectField
          label={t('columns.icon')}
          hint={t('iconHint')}
          error={fieldError(errors.icon?.message)}
          {...register('icon', { setValueAs: (value) => value || null })}
        >
          <option value="">{t('noIcon')}</option>
          {AMENITY_ICON_KEYS.map((key) => (
            <option key={key} value={key} dir="ltr">
              {key}
            </option>
          ))}
        </SelectField>
      )}
      {fields.sortOrder && (
        <TextField
          label={t('columns.sortOrder')}
          type="number"
          min={0}
          dir="ltr"
          error={fieldError(errors.sortOrder?.message)}
          {...register('sortOrder', { setValueAs: asOptionalNumber })}
        />
      )}
      <CheckboxField label={t('activeField')} {...register('isActive')} />
    </ApiForm>
  );
}
