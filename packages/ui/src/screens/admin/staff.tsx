'use client';

import {
  inviteStaffRequestSchema,
  langCodeValues,
  type StaffMember,
  staffRoleValues,
} from '@reih/contracts';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useApi } from '../../api/hooks';
import { useRefreshLists } from '../../api/lists';
import { ApiForm, SelectField, TextField, useApiForm, useFieldErrorText } from '../../forms';
import { AuthGate } from '../../shell';
import { richTags } from '../../text';
import { AccountsTable, InvitationsTable } from '../parts';

/** FR-ADM-03, UC-06.3: Data Operators and Platform Admins. */
export function StaffScreen() {
  const t = useTranslations('admin.staff');
  const api = useApi();
  return (
    <AuthGate roles={['platform_admin']} wide>
      {(me) => (
        <>
          <h1>{t('title')}</h1>
          <div className="reih-stack">
            <InviteStaff />
            <section className="reih-card" aria-labelledby="staff-pending-title">
              <h2 id="staff-pending-title">{t('pending')}</h2>
              <InvitationsTable<StaffMember>
                caption={t('pending')}
                listPath="/admin/staff"
                params={{ status: 'invited' }}
                pick={(member) => member.pendingInvitation}
                actionBase="/admin/invitations"
                empty={t('noPending')}
              />
            </section>
            <section className="reih-card" aria-labelledby="staff-list-title">
              <h2 id="staff-list-title">{t('members')}</h2>
              <p className="reih-hint">{t('lastAdminHint')}</p>
              <AccountsTable<StaffMember>
                caption={t('members')}
                listPath="/admin/staff"
                meId={me.user.id}
                roles={staffRoleValues}
                empty={t('empty')}
                actions={{
                  changeRole: async (id, role) => {
                    await api.patch(`/admin/staff/${id}/role`, { body: { role } });
                  },
                  setStatus: async (id, status) => {
                    await api.post(
                      `/admin/staff/${id}/${status === 'active' ? 'reactivate' : 'deactivate'}`,
                    );
                  },
                }}
              />
            </section>
          </div>
        </>
      )}
    </AuthGate>
  );
}

function InviteStaff() {
  const t = useTranslations('admin.staff.invite');
  const tInv = useTranslations('invitations');
  const tRoles = useTranslations('roles');
  const tDialog = useTranslations('dialog');
  const tCommon = useTranslations('common');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(inviteStaffRequestSchema, {
    defaultValues: { email: '', role: 'data_operator', language: undefined },
    onSubmit: async (values) => {
      await api.post('/admin/staff/invitations', { body: values });
      await refresh('/admin/staff');
      form.form.reset({ email: '', role: values.role, language: undefined });
      return t.rich('sent', { email: values.email, ...richTags }) as ReactNode;
    },
  });
  const { errors } = form.form.formState;
  return (
    <section className="reih-card" aria-labelledby="staff-invite-title">
      <h2 id="staff-invite-title">{t('title')}</h2>
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
          {staffRoleValues.map((role) => (
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
  );
}
