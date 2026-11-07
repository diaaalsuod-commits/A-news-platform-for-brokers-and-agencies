'use client';

import { healthResponseSchema, type HealthResponse } from '@reih/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', { cache: 'no-store' });
  // The API answers 503 with the same body when a service is down.
  if (response.status !== 200 && response.status !== 503) {
    throw new Error(`Unexpected status ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}

export function HealthPanel() {
  const t = useTranslations('health');
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <section className="reih-card" aria-labelledby="health-title" aria-live="polite">
      <h2 id="health-title">{t('title')}</h2>

      {isPending && <p>{t('loading')}</p>}

      {isError && (
        <div role="alert">
          <p>{t('error')}</p>
          <button type="button" onClick={() => void refetch()} disabled={isFetching}>
            {t('retry')}
          </button>
        </div>
      )}

      {data && (
        <dl className="reih-health">
          <dt>{t('overall')}</dt>
          <dd data-state={data.status === 'ok' ? 'up' : 'down'}>{t(`status.${data.status}`)}</dd>
          <dt>{t('database')}</dt>
          <dd data-state={data.db}>{t(`service.${data.db}`)}</dd>
          <dt>{t('redis')}</dt>
          <dd data-state={data.redis}>{t(`service.${data.redis}`)}</dd>
        </dl>
      )}
    </section>
  );
}
