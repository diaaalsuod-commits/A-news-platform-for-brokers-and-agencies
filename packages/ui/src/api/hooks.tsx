'use client';

import { type MeResponse, meResponseSchema } from '@reih/contracts';
import type { Locale } from '@reih/i18n';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';
import type { AppKind, AppLinks } from '../app-config';
import { richTags } from '../text';
import { ApiClient } from './client';
import { ApiError, errorMessageRef } from './errors';
import { currentNextValue } from './safe-next';

interface AppContextValue {
  app: AppKind;
  links: AppLinks;
  api: ApiClient;
}

const AppContext = createContext<AppContextValue | null>(null);

export const ME_QUERY_KEY = ['me'] as const;

/**
 * The providers every page of both apps needs: data fetching, the API client, and which app this
 * is. A 401 from a call that needs a session sends the user to log in, keeping where they were.
 */
export function AppProviders({
  app,
  links,
  children,
}: {
  app: AppKind;
  links: AppLinks;
  children: ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A refused call is shown with a retry button; repeating it alone would only hide it.
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [api] = useState(
    () =>
      new ApiClient({
        language: () => document.documentElement.lang || locale,
        onUnauthorized: () => {
          queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
          const next = currentNextValue(window.location);
          const lang = document.documentElement.lang || locale;
          router.replace(`/${lang}/login?next=${encodeURIComponent(next)}`);
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={{ app, links, api }}>{children}</AppContext.Provider>
    </QueryClientProvider>
  );
}

function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('AppProviders is missing around this component');
  }
  return value;
}

export const useApi = () => useAppContext().api;
export const useApp = () => useAppContext().app;
export const useAppLinks = () => useAppContext().links;

/** The logged-in user; a 401 sends the user to log in. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.get<MeResponse>('/me', { schema: meResponseSchema }),
  });
}

/** The logged-in user, or null when nobody is: for pages anyone may open, such as login. */
export function useOptionalMe() {
  const api = useApi();
  return useQuery({
    queryKey: [...ME_QUERY_KEY, 'optional'],
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/me', {
          schema: meResponseSchema,
          redirectOnUnauthorized: false,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

/** Turns any failure into its localized message (never a code or a stack trace). */
export function useErrorText() {
  const t = useTranslations();
  return useCallback(
    (error: unknown): ReactNode => {
      const { key, values } = errorMessageRef(error);
      return t.rich(key, { ...values, ...richTags });
    },
    [t],
  );
}

/** The saved language cookie, shared with the middleware; the last choice survives logout. */
export function rememberLocale(locale: Locale): void {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Ends the session on the server, forgets the user, and opens the login page in this language. */
export function useLogout() {
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const locale = useLocale();
  return useCallback(
    async (target: 'login' | 'no-access' = 'login') => {
      try {
        await api.post('/auth/logout', { redirectOnUnauthorized: false });
      } finally {
        queryClient.clear();
        const lang = document.documentElement.lang || locale;
        router.replace(`/${lang}/${target}`);
      }
    },
    [api, queryClient, router, locale],
  );
}
