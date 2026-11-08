import { describe, expect, it } from 'vitest';
import { ApiError } from './api/errors';
import { isFinalLinkRefusal, linkTokenStore, type TokenStorage } from './link-token';

const TOKEN = 'A'.repeat(43);

function memoryStorage(): TokenStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('link token store', () => {
  it('keeps a well-formed token per page and forgets it', () => {
    const storage = memoryStorage();
    const activate = linkTokenStore('activate', () => storage);
    const reset = linkTokenStore('reset', () => storage);

    activate.save(TOKEN);
    expect(activate.read()).toBe(TOKEN);
    expect(reset.read()).toBeNull();

    activate.forget();
    expect(activate.read()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it('never keeps or returns a malformed token', () => {
    const storage = memoryStorage();
    const store = linkTokenStore('reset', () => storage);
    store.save('not-a-token');
    expect(storage.data.size).toBe(0);
    storage.setItem(store.key, 'tampered value');
    expect(store.read()).toBeNull();
  });

  it('works without storage, and when storage refuses', () => {
    const missing = linkTokenStore('activate', () => null);
    expect(() => missing.save(TOKEN)).not.toThrow();
    expect(missing.read()).toBeNull();

    const refusing = linkTokenStore('activate', () => {
      throw new Error('SecurityError');
    });
    expect(() => refusing.forget()).not.toThrow();
  });
});

describe('isFinalLinkRefusal', () => {
  it.each([
    ['INVITATION_NOT_FOUND', 404],
    ['INVITATION_EXPIRED', 410],
    ['INVITATION_USED', 410],
    ['INVITATION_CANCELLED', 410],
    ['RESET_LINK_INVALID', 400],
    ['RESET_LINK_EXPIRED', 410],
    ['RESET_LINK_USED', 410],
  ])('FR-ACC-01 FR-ACC-03 %s forgets the token: the link will never work again', (code, status) => {
    const storage = memoryStorage();
    const store = linkTokenStore('activate', () => storage);
    store.save(TOKEN);
    const error = new ApiError(code, status);

    expect(isFinalLinkRefusal(error)).toBe(true);
    if (isFinalLinkRefusal(error)) store.forget();
    expect(store.read()).toBeNull();
  });

  it.each([
    ['NETWORK_ERROR', 0],
    ['TOO_MANY_REQUESTS', 429],
    ['SERVICE_UNAVAILABLE', 503],
    ['VALIDATION_FAILED', 400],
    ['TERMS_NOT_ACCEPTED', 400],
    ['CSRF_TOKEN_INVALID', 403],
  ])('keeps the token after %s, so the user can try again', (code, status) => {
    expect(isFinalLinkRefusal(new ApiError(code, status))).toBe(false);
  });

  it('keeps the token after an error that is not from the API', () => {
    expect(isFinalLinkRefusal(new Error('boom'))).toBe(false);
  });
});
