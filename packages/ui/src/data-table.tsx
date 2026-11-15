'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { LoadState } from './shell';
import {
  nextSort,
  type SortState,
  type SortValue,
  TABLE_PAGE_SIZE,
  tableView,
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
  /**
   * Server paging, for lists too long to load whole (5,000 projects): rows is the page the API
   * sent, in its order, and the pager asks for another page. Headers do not sort, because the API
   * has no sort parameter. Without it, the whole list is loaded and sorted and paged here.
   */
  server?: ServerPaging;
}

export interface ServerPaging {
  page: number;
  total: number;
  onPage: (page: number) => void;
}

/**
 * The one table of every list screen (SRS 3.1, NFR-12, NFR-14): sortable columns, paging, and the
 * loading, empty and error-with-retry states. By default sorting and paging run on the loaded list,
 * and search and status filters go to the API; with server, the API pages too (tableView).
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
  server,
}: DataTableProps<T>) {
  const t = useTranslations('table');
  const locale = useLocale();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [clientPage, setClientPage] = useState(1);

  const view = useMemo(() => {
    const list = rows ?? [];
    if (server) {
      return tableView(list, { mode: 'server', page: server.page, pageSize, total: server.total });
    }
    const column = sort ? columns.find((candidate) => candidate.key === sort.key) : undefined;
    return tableView(
      list,
      { mode: 'client', page: clientPage, pageSize },
      column?.sortValue && sort
        ? { value: column.sortValue, direction: sort.direction, locale }
        : undefined,
    );
  }, [rows, columns, sort, locale, server, clientPage, pageSize]);
  const { visible, pages, page: current, sortable } = view;
  const setPage = (page: number) => (server ? server.onPage(page) : setClientPage(page));

  return (
    <LoadState pending={pending && rows === undefined} error={error} onRetry={onRetry}>
      {visible.length === 0 ? (
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
                  const active = sortable && sort?.key === column.key;
                  const ariaSort = active
                    ? sort?.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined;
                  return (
                    <th key={column.key} scope="col" aria-sort={ariaSort}>
                      {sortable && column.sortValue ? (
                        <button
                          type="button"
                          className="reih-sort"
                          onClick={() => {
                            setSort(nextSort(sort, column.key));
                            setClientPage(1);
                          }}
                        >
                          {column.header}
                          <span aria-hidden="true">
                            {active ? (sort?.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
                          </span>
                          <span className="reih-visually-hidden">
                            {active
                              ? t(
                                  sort?.direction === 'asc'
                                    ? 'sortedAscending'
                                    : 'sortedDescending',
                                )
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
