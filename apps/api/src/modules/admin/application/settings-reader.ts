import { Injectable } from '@nestjs/common';
import { AdminReadRepository, type SettingsRow } from '../infrastructure/admin-read.repository.js';

export type PlatformSettings = SettingsRow;

/** FR-ADM-06: the platform settings, read fresh each time so a change applies at once. */
@Injectable()
export class SettingsReader {
  constructor(private readonly repository: AdminReadRepository) {}

  get(): Promise<PlatformSettings> {
    return this.repository.settings();
  }
}
