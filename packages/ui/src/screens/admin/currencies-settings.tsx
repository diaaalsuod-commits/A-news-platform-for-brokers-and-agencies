'use client';

import {
  addExchangeRateRequestSchema,
  type AdminCurrency,
  BASE_CURRENCY,
  type ExchangeRate,
  type PlatformSettingsResponse,
  platformSettingsSchema,
  SETTINGS_LIMITS,
  updateSettingsRequestSchema,
} from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi, useErrorText } from '../../api/hooks';
import { useFullList, useRefreshLists } from '../../api/lists';
import { type Column, DataTable } from '../../data-table';
import { uaeToday } from '../../format';
import { ApiForm, TextField, useApiForm, useFieldErrorText } from '../../forms';
import { AuthGate, LoadState } from '../../shell';
import { Ltr, richTags } from '../../text';
import { DateTime } from '../parts';

/** FR-ADM-05, FR-ADM-06, FR-LOC-01, UC-06.5, UC-06.6. */
export function CurrenciesSettingsScreen() {
  const t = useTranslations('admin.currencies');
  return (
    <AuthGate roles={['platform_admin']} wide>
      {() => (
        <>
          <h1>{t('title')}</h1>
          <div className="reih-stack">
            <Currencies />
            <Settings />
          </div>
        </>
      )}
    </AuthGate>
  );
}

// ---------------------------------------------------------------- currencies and rates

function RateValue({ rate }: { rate: ExchangeRate }) {
  const t = useTranslations('admin.currencies');
  return (
    <>
      {t.rich('rateValue', {
        value: rate.aedPerUnit,
        code: rate.currencyCode,
        ...richTags,
      })}{' '}
      <span className="reih-muted">
        {t.rich('rateDate', { date: rate.effectiveDate, ...richTags })}
      </span>
    </>
  );
}

function Currencies() {
  const t = useTranslations('admin.currencies');
  const locale = useLocale();
  const api = useApi();
  const errorText = useErrorText();
  const refresh = useRefreshLists();
  const list = useFullList<AdminCurrency>('/admin/currencies');
  const [selected, setSelected] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const setEnabled = async (currency: AdminCurrency, isEnabled: boolean) => {
    setActionError(null);
    try {
      await api.patch(`/admin/currencies/${currency.code}`, { body: { isEnabled } });
      await refresh('/admin/currencies');
      await refresh('/currencies');
    } catch (error) {
      setActionError(error);
    }
  };

  const columns: Column<AdminCurrency>[] = [
    {
      key: 'code',
      header: t('columns.code'),
      cell: (row) => <Ltr>{row.code}</Ltr>,
      sortValue: (row) => row.code,
    },
    {
      key: 'name',
      header: t('columns.name'),
      cell: (row) => (locale === 'ar' ? row.nameAr : row.nameEn),
      sortValue: (row) => (locale === 'ar' ? row.nameAr : row.nameEn),
    },
    {
      key: 'enabled',
      header: t('columns.enabled'),
      cell: (row) =>
        row.code === BASE_CURRENCY ? (
          <span className="reih-badge" data-tone="success">
            {t('alwaysOn')}
          </span>
        ) : (
          <span className="reih-badge" data-tone={row.isEnabled ? 'success' : undefined}>
            {row.isEnabled ? t('enabled') : t('disabled')}
          </span>
        ),
      sortValue: (row) => row.isEnabled,
    },
    {
      key: 'latest',
      header: t('columns.latest'),
      cell: (row) =>
        row.code === BASE_CURRENCY ? (
          <span className="reih-muted">{t('baseCurrency')}</span>
        ) : row.latestRate ? (
          <RateValue rate={row.latestRate} />
        ) : (
          <span className="reih-muted">{t('noRate')}</span>
        ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (row) =>
        row.code === BASE_CURRENCY ? null : (
          <div className="reih-row-actions">
            <button type="button" onClick={() => void setEnabled(row, !row.isEnabled)}>
              {row.isEnabled ? t('disable') : t('enable')}
            </button>
            <button
              type="button"
              aria-pressed={selected === row.code}
              onClick={() => setSelected(row.code)}
            >
              {t('rates')}
            </button>
          </div>
        ),
    },
  ];

  const current = list.data?.find((currency) => currency.code === selected);
  return (
    <section className="reih-card" aria-labelledby="currencies-title">
      <h2 id="currencies-title">{t('currenciesTitle')}</h2>
      <p className="reih-hint">{t('intro')}</p>
      {actionError !== null && (
        <div role="alert" className="reih-alert" data-tone="error">
          {errorText(actionError)}
        </div>
      )}
      <DataTable
        caption={t('currenciesTitle')}
        columns={columns}
        rows={list.data}
        rowKey={(row) => row.code}
        pending={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={t('empty')}
      />
      {current && <RatePanel currency={current} />}
    </section>
  );
}

/** A dated rate for one currency: decimal string, a UAE day no later than today. */
function RatePanel({ currency }: { currency: AdminCurrency }) {
  const t = useTranslations('admin.currencies');
  const tDialog = useTranslations('dialog');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const ratesPath = `/admin/currencies/${currency.code}/rates`;
  const rates = useFullList<ExchangeRate>(ratesPath);
  const today = uaeToday();
  const schema = addExchangeRateRequestSchema.refine((value) => value.effectiveDate <= uaeToday(), {
    path: ['effectiveDate'],
    message: 'validation.dateInFuture',
  });
  const form = useApiForm(schema, {
    defaultValues: { aedPerUnit: '', effectiveDate: today },
    onSubmit: async (values) => {
      await api.post(ratesPath, { body: values });
      await Promise.all([refresh(ratesPath), refresh('/admin/currencies'), refresh('/currencies')]);
      form.form.reset({ aedPerUnit: '', effectiveDate: uaeToday() });
      return t('rateSaved');
    },
  });
  const { errors } = form.form.formState;

  const columns: Column<ExchangeRate>[] = [
    {
      key: 'date',
      header: t('columns.effectiveDate'),
      cell: (row) => <Ltr>{row.effectiveDate}</Ltr>,
      sortValue: (row) => new Date(row.effectiveAt),
    },
    {
      key: 'value',
      header: t('columns.aedPerUnit'),
      cell: (row) => <Ltr>{row.aedPerUnit}</Ltr>,
      sortValue: (row) => Number(row.aedPerUnit),
    },
    {
      key: 'entered',
      header: t('columns.enteredAt'),
      cell: (row) => <DateTime iso={row.createdAt} />,
      sortValue: (row) => new Date(row.createdAt),
    },
  ];

  return (
    <section className="reih-card" aria-labelledby="rates-title">
      <h3 id="rates-title">{t.rich('ratesTitle', { code: currency.code, ...richTags })}</h3>
      <ApiForm api={form} submitLabel={t('addRate')} pendingLabel={tDialog('working')}>
        <TextField
          label={t.rich('aedPerUnitLabel', { code: currency.code, ...richTags })}
          inputMode="decimal"
          dir="ltr"
          autoComplete="off"
          hint={t('aedPerUnitHint')}
          error={fieldError(errors.aedPerUnit?.message)}
          {...form.form.register('aedPerUnit')}
        />
        <TextField
          label={t('columns.effectiveDate')}
          type="date"
          dir="ltr"
          max={today}
          hint={t('effectiveDateHint')}
          error={fieldError(errors.effectiveDate?.message)}
          {...form.form.register('effectiveDate')}
        />
      </ApiForm>
      <DataTable
        caption={t.rich('historyCaption', { code: currency.code, ...richTags })}
        columns={columns}
        rows={rates.data}
        rowKey={(row) => row.id}
        pending={rates.isPending}
        error={rates.error}
        onRetry={() => void rates.refetch()}
        empty={t('noRates')}
        initialSort={{ key: 'date', direction: 'desc' }}
      />
    </section>
  );
}

// ---------------------------------------------------------------- settings (FR-ADM-06)

function Settings() {
  const t = useTranslations('admin.settings');
  const api = useApi();
  const settings = useQuery({
    queryKey: ['item', '/admin/settings'],
    queryFn: () =>
      api.get<PlatformSettingsResponse>('/admin/settings', { schema: platformSettingsSchema }),
  });
  return (
    <section className="reih-card" aria-labelledby="settings-title">
      <h2 id="settings-title">{t('title')}</h2>
      <LoadState
        pending={settings.isPending}
        error={settings.error}
        onRetry={() => void settings.refetch()}
      >
        {settings.data && <SettingsForm settings={settings.data} />}
      </LoadState>
    </section>
  );
}

const asNumber = (value: unknown) => (value === '' ? undefined : Number(value));

function SettingsForm({ settings }: { settings: PlatformSettingsResponse }) {
  const t = useTranslations('admin.settings');
  const tDialog = useTranslations('dialog');
  const api = useApi();
  const refresh = useRefreshLists();
  const fieldError = useFieldErrorText();
  const form = useApiForm(updateSettingsRequestSchema, {
    defaultValues: {
      staleThresholdDays: settings.staleThresholdDays,
      invitationValidityDays: settings.invitationValidityDays,
      dailyRevealLimit: settings.dailyRevealLimit,
    },
    onSubmit: async (values) => {
      await api.patch('/admin/settings', { body: values, schema: platformSettingsSchema });
      await refresh('/admin/settings');
      return t('saved');
    },
  });
  const { errors } = form.form.formState;
  const range = (name: keyof typeof SETTINGS_LIMITS) =>
    t.rich('range', { ...SETTINGS_LIMITS[name], ...richTags });
  return (
    <ApiForm api={form} submitLabel={t('save')} pendingLabel={tDialog('working')}>
      <TextField
        label={t('staleThresholdDays')}
        type="number"
        dir="ltr"
        min={SETTINGS_LIMITS.staleThresholdDays.min}
        max={SETTINGS_LIMITS.staleThresholdDays.max}
        hint={range('staleThresholdDays')}
        error={fieldError(errors.staleThresholdDays?.message)}
        {...form.form.register('staleThresholdDays', { setValueAs: asNumber })}
      />
      <TextField
        label={t('invitationValidityDays')}
        type="number"
        dir="ltr"
        min={SETTINGS_LIMITS.invitationValidityDays.min}
        max={SETTINGS_LIMITS.invitationValidityDays.max}
        hint={range('invitationValidityDays')}
        error={fieldError(errors.invitationValidityDays?.message)}
        {...form.form.register('invitationValidityDays', { setValueAs: asNumber })}
      />
      <TextField
        label={t('dailyRevealLimit')}
        type="number"
        dir="ltr"
        min={SETTINGS_LIMITS.dailyRevealLimit.min}
        max={SETTINGS_LIMITS.dailyRevealLimit.max}
        hint={
          <>
            {range('dailyRevealLimit')} {t('revealLimitLater')}
          </>
        }
        error={fieldError(errors.dailyRevealLimit?.message)}
        {...form.form.register('dailyRevealLimit', { setValueAs: asNumber })}
      />
      <p className="reih-hint">
        {t('updatedAt')} <DateTime iso={settings.updatedAt} />
      </p>
    </ApiForm>
  );
}
