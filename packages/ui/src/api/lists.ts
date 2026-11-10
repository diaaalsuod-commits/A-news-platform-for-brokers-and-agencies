'use client';

import { MAX_PAGE_SIZE } from '@reih/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useApi } from './hooks';

interface ListPage<T> {
  items: T[];
  total: number;
}

/** A path with its filters as query parameters; empty filters are left out. */
export function withQuery(path: string, params: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(name, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/**
 * Every item of an API list, read in pages of 100 (the API's maximum), for the DataTable to sort
 * and page. The admin lists are small; filters such as q and status still go to the API.
 */
export function useFullList<T>(path: string, params: Record<string, string | undefined> = {}) {
  const api = useApi();
  return useQuery({
    queryKey: ['list', path, params],
    queryFn: async () => {
      const items: T[] = [];
      for (let page = 1; ; page += 1) {
        const result = await api.get<ListPage<T>>(
          withQuery(path, { ...params, page: String(page), pageSize: String(MAX_PAGE_SIZE) }),
        );
        items.push(...result.items);
        if (result.items.length === 0 || items.length >= result.total) return items;
      }
    },
  });
}

/** After a change: reloads every list and item under this path, so all views agree. */
export function useRefreshLists() {
  const queryClient = useQueryClient();
  return useCallback(
    (path: string) =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.some((part) => typeof part === 'string' && part.startsWith(path)),
      }),
    [queryClient],
  );
}
