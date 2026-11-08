import type { ReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  PROFILE_PHOTO_MAX_BYTES,
  type UpdatePreferencesRequest,
  type UpdateProfileRequest,
} from '@reih/contracts';
import { RatesReader } from '../../admin/index.js';
import { downloadHeaders, FileStorage } from '../../../shared/files/index.js';
import { AppError } from '../../../shared/http/index.js';
import { UserRepository } from '../infrastructure/user.repository.js';

/** FR-ACC-05: where profile photos are stored under FILES_DIR. */
export const PROFILE_PHOTO_DIRECTORY = 'profile-photos';

/** FR-ACC-05 profile and photo, FR-ACC-06 preferences: the caller's own account only. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly rates: RatesReader,
    private readonly files: FileStorage,
  ) {}

  async updateProfile(userId: string, changes: UpdateProfileRequest): Promise<void> {
    await this.users.updateProfile(userId, changes, new Date());
  }

  /** The currency must be one the Platform Admin enabled (FR-ADM-05). */
  async updatePreferences(userId: string, changes: UpdatePreferencesRequest): Promise<void> {
    if (changes.currency !== undefined && !(await this.rates.isEnabledCurrency(changes.currency))) {
      throw new AppError('CURRENCY_NOT_ENABLED', HttpStatus.BAD_REQUEST);
    }
    await this.users.updatePreferences(
      userId,
      {
        prefLanguage: changes.language,
        prefCurrency: changes.currency,
        prefAreaUnit: changes.areaUnit,
      },
      new Date(),
    );
  }

  /**
   * JPEG or PNG up to 2 MB, judged by its bytes, never by its name. The file is streamed to disk;
   * nothing stays if it is refused. The old photo is removed once the new one is saved.
   */
  async replacePhoto(userId: string, source: Readable): Promise<void> {
    const stored = await this.files.save(source, {
      directory: PROFILE_PHOTO_DIRECTORY,
      maxBytes: PROFILE_PHOTO_MAX_BYTES,
      allowed: ['jpeg', 'png'],
    });
    let previous: string | null;
    try {
      previous = await this.users.replacePhoto(userId, stored.key, new Date());
    } catch (error) {
      await this.files.remove(stored.key);
      throw error;
    }
    await this.removeQuietly(previous);
  }

  async removePhoto(userId: string): Promise<void> {
    await this.removeQuietly(await this.users.replacePhoto(userId, null, new Date()));
  }

  /** The caller's own photo, with the headers every download carries. */
  async openPhoto(
    userId: string,
  ): Promise<{ stream: ReadStream; headers: Record<string, string> }> {
    const key = (await this.users.findProfile(userId))?.photoPath;
    if (!key) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const stream = this.files.openRead(key);
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', () => reject(new AppError('NOT_FOUND', HttpStatus.NOT_FOUND)));
    });
    return { stream, headers: downloadHeaders(key) };
  }

  /** A file left behind costs only disk space, so a failed removal is logged, not raised. */
  private async removeQuietly(key: string | null): Promise<void> {
    if (key === null) return;
    try {
      await this.files.remove(key);
    } catch (error) {
      this.logger.warn({ msg: 'Old profile photo not removed', key, err: error });
    }
  }
}
