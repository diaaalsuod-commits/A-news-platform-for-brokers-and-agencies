import { Injectable } from '@nestjs/common';
import type { PlatformSettingsResponse, UpdateSettingsRequest } from '@reih/contracts';
import { SettingsRepository } from '../infrastructure/settings.repository.js';
import { SettingsReader } from './settings-reader.js';

/**
 * FR-ADM-06: the stale-data threshold, the invitation validity and the daily reveal limit. The
 * limit is stored now and used once FR-CNT-02 is delivered. SettingsReader reads fresh on every
 * call, so a change applies at once (stale badges, the next invitation's expiry).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly reader: SettingsReader,
    private readonly repository: SettingsRepository,
  ) {}

  async get(): Promise<PlatformSettingsResponse> {
    const current = await this.reader.get();
    return { ...current, updatedAt: current.updatedAt.toISOString() };
  }

  async update(changes: UpdateSettingsRequest, by: string): Promise<PlatformSettingsResponse> {
    if (Object.keys(changes).length > 0) {
      await this.repository.update(changes, by, new Date());
    }
    return this.get();
  }
}
