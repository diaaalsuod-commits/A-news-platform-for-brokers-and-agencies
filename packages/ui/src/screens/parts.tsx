'use client';

import type { InvitationSummary, UserRole, UserStatus } from '@reih/contracts';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { useApi } from '../api/hooks';
import { useFullList, useRefreshLists } from '../api/lists';
import { type Column, DataTable } from '../data-table';
import { ConfirmDialog, Dialog } from '../dialog';
import { formatDateTime } from '../format';
import { ApiForm, SelectField, useApiForm } from '../forms';
import { Ltr } from '../text';
import { z } from 'zod';

/** A time in UAE time, inside <bdi dir="ltr">; a dash when there is none. */
export function DateTime({ iso }: { iso: string | null }) {
  return iso ? <Ltr>{formatDateTime(iso)}</Ltr> : <span aria-hidden="true">—</span>;
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const t = useTranslations('accounts.status');
  const tone = status === 'active' ? 'success' : status === 'deactivated' ? 'warning' : undefined;
  return (
    <span className="reih-badge" data-tone={tone}>
      {t(status)}
    </span>
  );
}

/** Initials instead of a photo: no endpoint serves another member's photo yet (P3.3). */
export function Avatar({ name, email }: { name: string | null; email: string }) {
  const source = (name ?? email).trim();
  const initials = source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span className="reih-avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------- accounts (staff, members)

export interface Account {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
}

export interface AccountActions {
  changeRole: (id: string, role: UserRole) => Promise<void>;
  setStatus: (id: string, status: 'active' | 'deactivated') => Promise<void>;
}

type Pending =
  | { kind: 'role'; account: Account }
  | { kind: 'status'; account: Account; status: 'active' | 'deactivated' }
  | null;

/**
 * FR-ADM-03, FR-AGY-03, FR-AGY-04: the accounts an admin manages, with role and status changes
 * behind a confirmation. The caller's own row has no actions (the API refuses them as well).
 */
export function AccountsTable<T extends Account>({
  caption,
  listPath,
  params,
  meId,
  roles,
  actions,
  empty,
}: {
  caption: ReactNode;
  listPath: string;
  params?: Record<string, string | undefined>;
  meId: string;
  roles: readonly UserRole[];
  actions: AccountActions;
  empty: ReactNode;
}) {
  const t = useTranslations('accounts');
  const tRoles = useTranslations('roles');
  const list = useFullList<T>(listPath, params);
  const refresh = useRefreshLists();
  const [pending, setPending] = useState<Pending>(null);

  const columns: Column<T>[] = [
    {
      key: 'name',
      header: t('columns.name'),
      cell: (row) => (
        <span className="reih-color-field">
          <Avatar name={row.fullName} email={row.email} />
          {row.fullName ?? <span className="reih-muted">{t('noName')}</span>}
        </span>
      ),
      sortValue: (row) => row.fullName,
    },
    {
      key: 'email',
      header: t('columns.email'),
      cell: (row) => <Ltr>{row.email}</Ltr>,
      sortValue: (row) => row.email,
    },
    {
      key: 'role',
      header: t('columns.role'),
      cell: (row) => tRoles(row.role),
      sortValue: (row) => tRoles(row.role),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => <UserStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
    {
      key: 'lastLogin',
      header: t('columns.lastLogin'),
      cell: (row) => <DateTime iso={row.lastLoginAt} />,
      sortValue: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt) : null),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (row) =>
        row.id === meId ? (
          <span className="reih-muted">{t('you')}</span>
        ) : row.status === 'invited' ? (
          <span className="reih-muted">{t('invitedHint')}</span>
        ) : (
          <div className="reih-row-actions">
            {row.status === 'active' && (
              <button type="button" onClick={() => setPending({ kind: 'role', account: row })}>
                {t('changeRole')}
              </button>
            )}
            {row.status === 'active' ? (
              <button
                type="button"
                onClick={() => setPending({ kind: 'status', account: row, status: 'deactivated' })}
              >
                {t('deactivate')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPending({ kind: 'status', account: row, status: 'active' })}
              >
                {t('reactivate')}
              </button>
            )}
          </div>
        ),
    },
  ];

  const done = () => refresh(listPath);
  const who = pending ? (pending.account.fullName ?? pending.account.email) : '';
  return (
    <>
      <DataTable
        caption={caption}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={empty}
        initialSort={{ key: 'email', direction: 'asc' }}
      />
      <ConfirmDialog
        open={pending?.kind === 'status'}
        onClose={() => setPending(null)}
        title={
          pending?.kind === 'status' && pending.status === 'deactivated'
            ? t('deactivateTitle')
            : t('reactivateTitle')
        }
        body={t.rich(
          pending?.kind === 'status' && pending.status === 'deactivated'
            ? 'deactivateBody'
            : 'reactivateBody',
          { name: who, strong: (chunks) => <strong>{chunks}</strong> },
        )}
        confirmLabel={
          pending?.kind === 'status' && pending.status === 'deactivated'
            ? t('deactivate')
            : t('reactivate')
        }
        danger={pending?.kind === 'status' && pending.status === 'deactivated'}
        onConfirm={async () => {
          if (pending?.kind !== 'status') return;
          await actions.setStatus(pending.account.id, pending.status);
          await done();
        }}
      />
      <Dialog
        open={pending?.kind === 'role'}
        onClose={() => setPending(null)}
        title={t('changeRoleTitle')}
      >
        {pending?.kind === 'role' && (
          <RoleForm
            account={pending.account}
            roles={roles}
            onSubmit={async (role) => {
              await actions.changeRole(pending.account.id, role);
              await done();
              setPending(null);
            }}
            onCancel={() => setPending(null)}
          />
        )}
      </Dialog>
    </>
  );
}

function RoleForm({
  account,
  roles,
  onSubmit,
  onCancel,
}: {
  account: Account;
  roles: readonly UserRole[];
  onSubmit: (role: UserRole) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('accounts');
  const tRoles = useTranslations('roles');
  const tDialog = useTranslations('dialog');
  const schema = z.object({ role: z.enum(roles as [UserRole, ...UserRole[]]) });
  const api = useApiForm(schema, {
    defaultValues: { role: account.role },
    onSubmit: ({ role }) => onSubmit(role),
  });
  return (
    <ApiForm
      api={api}
      submitLabel={t('changeRole')}
      pendingLabel={tDialog('working')}
      secondary={
        <button type="button" onClick={onCancel}>
          {tDialog('cancel')}
        </button>
      }
    >
      <p>
        {t.rich('changeRoleBody', {
          name: account.fullName ?? account.email,
          strong: (c) => <strong>{c}</strong>,
        })}
      </p>
      <SelectField label={t('columns.role')} {...api.form.register('role')}>
        {roles.map((role) => (
          <option key={role} value={role}>
            {tRoles(role)}
          </option>
        ))}
      </SelectField>
    </ApiForm>
  );
}

// ---------------------------------------------------------------- invitations

/**
 * FR-ADM-01, FR-ADM-03, FR-AGY-02: open invitations with resend and cancel. actionBase is where
 * the API takes them: /admin/invitations for the Platform Admin, /agency/invitations for an
 * Agency Admin.
 */
export function InvitationsTable<Item = InvitationSummary>({
  caption,
  listPath,
  params,
  pick,
  actionBase,
  empty,
  alsoRefresh = [],
}: {
  caption: ReactNode;
  listPath: string;
  params?: Record<string, string | undefined>;
  /** When the list holds accounts, the open invitation of each (the staff list does). */
  pick?: (item: Item) => InvitationSummary | null;
  actionBase: string;
  empty: ReactNode;
  alsoRefresh?: readonly string[];
}) {
  const t = useTranslations('invitations');
  const tRoles = useTranslations('roles');
  const api = useApi();
  const list = useFullList<Item>(listPath, params);
  const rows = list.data?.flatMap((item) => {
    const invitation = pick ? pick(item) : (item as unknown as InvitationSummary);
    return invitation ? [invitation] : [];
  });
  const refresh = useRefreshLists();
  const [pending, setPending] = useState<{
    action: 'resend' | 'cancel';
    row: InvitationSummary;
  } | null>(null);

  const columns: Column<InvitationSummary>[] = [
    {
      key: 'email',
      header: t('columns.email'),
      cell: (row) => <Ltr>{row.email}</Ltr>,
      sortValue: (row) => row.email,
    },
    {
      key: 'role',
      header: t('columns.role'),
      cell: (row) => tRoles(row.role as UserRole),
      sortValue: (row) => row.role,
    },
    {
      key: 'state',
      header: t('columns.state'),
      cell: (row) => (
        <span className="reih-badge" data-tone={row.state === 'expired' ? 'warning' : undefined}>
          {t(`state.${row.state}`)}
        </span>
      ),
      sortValue: (row) => row.state,
    },
    {
      key: 'expires',
      header: t('columns.expires'),
      cell: (row) => <DateTime iso={row.expiresAt} />,
      sortValue: (row) => new Date(row.expiresAt),
    },
    {
      key: 'lastSent',
      header: t('columns.lastSent'),
      cell: (row) => <DateTime iso={row.lastSentAt} />,
      sortValue: (row) => new Date(row.lastSentAt),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (row) => (
        <div className="reih-row-actions">
          <button type="button" onClick={() => setPending({ action: 'resend', row })}>
            {t('resend')}
          </button>
          <button type="button" onClick={() => setPending({ action: 'cancel', row })}>
            {t('cancel')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        caption={caption}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={empty}
        initialSort={{ key: 'lastSent', direction: 'desc' }}
      />
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === 'cancel' ? t('cancelTitle') : t('resendTitle')}
        body={t.rich(pending?.action === 'cancel' ? 'cancelBody' : 'resendBody', {
          email: pending?.row.email ?? '',
          ltr: (chunks) => <Ltr>{chunks}</Ltr>,
        })}
        confirmLabel={pending?.action === 'cancel' ? t('cancel') : t('resend')}
        danger={pending?.action === 'cancel'}
        onConfirm={async () => {
          if (!pending) return;
          await api.post(`${actionBase}/${pending.row.id}/${pending.action}`);
          await Promise.all([listPath, ...alsoRefresh].map((path) => refresh(path)));
        }}
      />
    </>
  );
}
