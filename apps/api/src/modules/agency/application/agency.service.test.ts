import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../../../shared/events/index.js';
import type { FileStorage } from '../../../shared/files/index.js';
import type { AgencyRepository } from '../infrastructure/agency.repository.js';
import type { BrandingRepository } from '../infrastructure/branding.repository.js';
import { AgencyService } from './agency.service.js';

describe('AgencyService logo storage', () => {
  function service(setLogo: () => Promise<void>) {
    const files = {
      save: vi.fn(async () => ({
        key: 'agency-logos/new.png',
        kind: 'png',
        mimeType: 'image/png',
        sizeBytes: 10,
      })),
      remove: vi.fn(async () => undefined),
    };
    const branding = { setLogo: vi.fn(setLogo), find: vi.fn(async () => null) };
    const agencies = new AgencyService(
      {} as AgencyRepository,
      branding as unknown as BrandingRepository,
      files as unknown as FileStorage,
      {} as EventBus,
    );
    return { agencies, files, branding };
  }

  it('FR-AGY-01 removes the new file when the row cannot be updated, and never the old one', async () => {
    const failure = new Error('database down');
    const { agencies, files } = service(async () => {
      throw failure;
    });
    await expect(agencies.replaceLogo('agency-1', Readable.from([]))).rejects.toBe(failure);
    expect(files.remove).toHaveBeenCalledTimes(1);
    expect(files.remove).toHaveBeenCalledWith('agency-logos/new.png');
  });

  it('FR-AGY-01 removes no file when the new logo is saved', async () => {
    const { agencies, files, branding } = service(async () => undefined);
    // brandingOf reads the row afterwards; this stand-in has none, so it answers 404.
    await expect(agencies.replaceLogo('agency-1', Readable.from([]))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(branding.setLogo).toHaveBeenCalledWith(
      'agency-1',
      'agency-logos/new.png',
      expect.any(Date),
    );
    expect(files.remove).not.toHaveBeenCalled();
  });
});
