'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api/errors';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type LinkPage = 'activate' | 'reset';

/** The part of Web Storage the token store needs, so tests can pass their own. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Where a link token waits between reading it from the address and using it: this tab's
 * sessionStorage. Storage that is missing or refuses (private mode) only means it is not kept.
 */
export function linkTokenStore(page: LinkPage, storage: () => TokenStorage | null) {
  const key = `reih.${page}.token`;
  const attempt = <T>(action: (store: TokenStorage) => T): T | null => {
    try {
      const store = storage();
      return store ? action(store) : null;
    } catch {
      return null;
    }
  };
  return {
    key,
    read(): string | null {
      const stored = attempt((store) => store.getItem(key));
      return stored && TOKEN_PATTERN.test(stored) ? stored : null;
    },
    save(token: string): void {
      if (TOKEN_PATTERN.test(token)) attempt((store) => store.setItem(key, token));
    },
    forget(): void {
      attempt((store) => store.removeItem(key));
    },
  };
}

const FINAL_REFUSALS = new Set([
  'INVITATION_NOT_FOUND',
  'INVITATION_EXPIRED',
  'INVITATION_USED',
  'INVITATION_CANCELLED',
  'RESET_LINK_INVALID',
  'RESET_LINK_EXPIRED',
  'RESET_LINK_USED',
]);

/**
 * True when the API refused the link itself (not found, expired, used, cancelled): it will never
 * work again, so its token is forgotten. Anything else (a lost connection, a rate limit, a field
 * error) keeps the token, so the user can try again.
 */
export function isFinalLinkRefusal(error: unknown): boolean {
  return error instanceof ApiError && FINAL_REFUSALS.has(error.code);
}

const sessionStore = () => (typeof window === 'undefined' ? null : window.sessionStorage);

/**
 * The token of an emailed link (#token=…). It is read on the client only and at once removed from
 * the address bar with history.replaceState, so it is never sent to a server, kept in the history,
 * or copied with the address. It waits in this tab's sessionStorage, so a language switch on the
 * same page does not lose it, and is forgotten once the link is used or refused for good.
 */
export function useLinkToken(page: LinkPage) {
  const [state, setState] = useState<{ ready: boolean; token: string | null }>({
    ready: false,
    token: null,
  });

  useEffect(() => {
    const store = linkTokenStore(page, sessionStore);
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token');
    let token: string | null;
    if (fromHash !== null) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
      token = TOKEN_PATTERN.test(fromHash) ? fromHash : null;
      if (token) store.save(token);
      else store.forget();
    } else {
      token = store.read();
    }
    // The address bar can only be read after mounting, in the browser.
    setState({ ready: true, token });
  }, [page]);

  /** Call after the link was used, or with the API's refusal: a final one forgets the token. */
  const forget = useCallback(() => linkTokenStore(page, sessionStore).forget(), [page]);
  const forgetIfRefused = useCallback(
    (error: unknown) => {
      if (isFinalLinkRefusal(error)) forget();
    },
    [forget],
  );

  return { ...state, forget, forgetIfRefused };
}
