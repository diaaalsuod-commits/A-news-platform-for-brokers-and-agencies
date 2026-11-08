import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { FileStorage } from '../../../shared/files/index.js';
import type { UserRepository } from '../infrastructure/user.repository.js';
import { AccountService } from './account.service.js';
import type { CurrencyPolicyPort } from './ports.js';

describe('AccountService photo storage', () => {
  function service(setPhoto: () => Promise<void>) {
    const files = {
      save: vi.fn(async () => ({
        key: 'profile-photos/new.png',
        kind: 'png',
        mimeType: 'image/png',
        sizeBytes: 10,
      })),
      remove: vi.fn(async () => undefined),
    };
    const users = { setPhoto: vi.fn(setPhoto) };
    const account = new AccountService(
      users as unknown as UserRepository,
      {} as CurrencyPolicyPort,
      files as unknown as FileStorage,
    );
    return { account, files, users };
  }

  it('FR-ACC-05 removes the new file when the row cannot be updated, and never the old one', async () => {
    const failure = new Error('database down');
    const { account, files } = service(async () => {
      throw failure;
    });
    await expect(account.replacePhoto('user-1', Readable.from([]))).rejects.toBe(failure);
    expect(files.remove).toHaveBeenCalledTimes(1);
    expect(files.remove).toHaveBeenCalledWith('profile-photos/new.png');
  });

  it('FR-ACC-05 replacing or removing a photo deletes no file', async () => {
    const { account, files, users } = service(async () => undefined);
    await account.replacePhoto('user-1', Readable.from([]));
    await account.removePhoto('user-1');
    expect(users.setPhoto).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'profile-photos/new.png',
      expect.any(Date),
    );
    expect(users.setPhoto).toHaveBeenNthCalledWith(2, 'user-1', null, expect.any(Date));
    expect(files.remove).not.toHaveBeenCalled();
  });
});
