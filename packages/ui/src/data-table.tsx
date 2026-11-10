'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { LoadState } from './shell';
import {
  nextSort,
  pageCount,
  pageRows,
  type SortState,
  type SortValue,
  sortRows,
  TABLE_PAGE_SIZE,
} from './table-model';
import { Ltr } from './text';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => SortValue;
}

export interface DataTableProps<T> {
  /** Names the table for screen readers. */
  caption: ReactNode;
  columns: readonly Column<T>[];
  /** Undefined while the list loads. */
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  /** Shown when the list is empty. */
  empty: ReactNode;
  initialSort?: SortState;
  pageSize?: number;
}

/**
 * The one table of every list screen (SRS 3.1, NFR-12, NFR-14): sortable columns, paging, and the
 * loading, empty and error-with-retry states. Sorting and paging run on the loaded list; search and
 * status filters go to the API.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  pending,
  error,
  onRetry,
  empty,
  initialSort,
  pageSize = TABLE_PAGE_SIZE,
}: DataTableProps<T>) {
  const t = useTranslations('table');
  const locale = useLocale();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const list = rows ?? [];
    const column = sort ? columns.find((candidate) => candidate.key === sort.key) : undefined;
    return column?.sortValue
      ? sortRows(list, column.sortValue, sort!.direction, locale)
      : [...list];
  }, [rows, columns, sort, locale]);
  const pages = pageCount(sorted.length, pageSize);
  const current = Math.min(page, pages);
  const visible = pageRows(sorted, current, pageSize);

  return (
    <LoadState pending={pending && rows === undefined} error={error} onRetry={onRetry}>
      {sorted.length === 0 ? (
        <p role="status" className="reih-empty">
          {empty}
        </p>
      ) : (
        <div className="reih-table-wrap">
          <table className="reih-table">
            <caption>{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  const ariaSort = active
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined;
                  return (
                    <th key={column.key} scope="col" aria-sort={ariaSort}>
                      {column.sortValue ? (
                        <button
                          type="button"
                          className="reih-sort"
                          onClick={() => {
                            setSort(nextSort(sort, column.key));
                            setPage(1);
                          }}
                        >
                          {column.header}
                          <span aria-hidden="true">
                            {active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
                          </span>
                          <span className="reih-visually-hidden">
                            {active
                              ? t(sort.direction === 'asc' ? 'sortedAscending' : 'sortedDescending')
                              : t('sortable')}
                          </span>
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.cell(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <nav className="reih-pager" aria-label={t('pages')}>
              <button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                {t('previous')}
              </button>
              <span aria-live="polite">
                {t.rich('pageOf', {
                  page: current,
                  pages,
                  ltr: (chunks) => <Ltr>{chunks}</Ltr>,
                })}
              </span>
              <button
                type="button"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                {t('next')}
              </button>
            </nav>
          )}
        </div>
      )}
    </LoadState>
  );
}
