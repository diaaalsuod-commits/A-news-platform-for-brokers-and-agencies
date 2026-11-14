import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateDeveloperRequest,
  type Developer,
  DEVELOPER_LOGO_MAX_BYTES,
  type DeveloperListQuery,
  type DeveloperListResponse,
  type UpdateDeveloperRequest,
} from '@reih/contracts';
import { isForeignKeyViolation } from '../../../shared/database/index.js';
import { type FileDownload, FileStorage } from '../../../shared/files/index.js';
import { AppError } from '../../../shared/http/index.js';
import { DEVELOPER_LOGO_DIRECTORY, developerLogoUrl } from '../domain/developer.js';
import { DeveloperRepository, type DeveloperRow } from '../infrastructure/developer.repository.js';
import { defined, notFound } from './errors.js';

function toDeveloper(row: DeveloperRow): Developer {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    website: row.website,
    logoUrl: developerLogoUrl(row.id, row.logoPath),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * FR-DAT-01: developers, managed by Data Operators. An archived developer keeps its data; that its
 * projects cannot be published is checked where projects are published (FR-DAT-05).
 */
@Injectable()
export class DeveloperService {
  constructor(
    private readonly developers: DeveloperRepository,
    private readonly files: FileStorage,
  ) {}

  async list(query: DeveloperListQuery): Promise<DeveloperListResponse> {
    const { items, total } = await this.developers.list(query);
    return { items: items.map(toDeveloper), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Developer> {
    const row = await this.developers.findById(id);
    if (!row) throw notFound();
    return toDeveloper(row);
  }

  /** A new developer starts active. */
  async create(input: CreateDeveloperRequest): Promise<Developer> {
    const id = await this.developers.create({
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      website: input.website ?? null,
    });
    return this.get(id);
  }

  /**
   * Only the fields sent change. status archives the developer or restores it. Archiving is
   * refused while the developer has published projects (P4.2, open item 2a): the operator
   * unpublishes them first, so no published project ever belongs to an archived developer
   * (FR-DAT-01, FR-DAT-05). The developer row is locked before the projects are counted, so a
   * publish under way finishes first and is counted, and one that starts later sees the archive.
   */
  async update(id: string, changes: UpdateDeveloperRequest): Promise<Developer> {
    if (changes.status !== 'archived') {
      const found = await this.developers.update(id, defined(changes), new Date());
      if (!found) throw notFound();
      return this.get(id);
    }
    await this.developers.transaction(async (tx) => {
      if (!(await this.developers.lock(tx, id))) throw notFound();
      if ((await this.developers.publishedProjectCount(tx, id)) > 0) {
        throw new AppError('DEVELOPER_HAS_PUBLISHED_PROJECTS', HttpStatus.CONFLICT);
      }
      await this.developers.update(id, defined(changes), new Date(), tx);
    });
    return this.get(id);
  }

  /**
   * The delete is attempted and the database's foreign keys decide: a developer with projects or
   * sales contacts, or one a broker marked as a favorite, answers DEVELOPER_IN_USE. Content never
   * reads the favorites table. The logo file, if any, stays on disk.
   */
  async delete(id: string): Promise<void> {
    let deleted: boolean;
    try {
      deleted = await this.developers.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AppError('DEVELOPER_IN_USE', HttpStatus.CONFLICT);
      }
      throw error;
    }
    if (!deleted) throw notFound();
  }

  /**
   * PNG or SVG up to 2 MB, judged by its bytes while it streams; an SVG is sanitized. Each logo
   * gets a new file and the previous one stays on disk, as for an agency's logo (docs/decisions.md,
   * P3.2). The new file is removed if no developer has this id or the row cannot be updated.
   */
  async replaceLogo(id: string, source: Readable): Promise<Developer> {
    const stored = await this.files.save(source, {
      directory: DEVELOPER_LOGO_DIRECTORY,
      maxBytes: DEVELOPER_LOGO_MAX_BYTES,
      allowed: ['png', 'svg'],
    });
    let found: boolean;
    try {
      found = await this.developers.setLogo(id, stored.key, new Date());
    } catch (error) {
      await this.files.remove(stored.key);
      throw error;
    }
    if (!found) {
      await this.files.remove(stored.key);
      throw notFound();
    }
    return this.get(id);
  }

  /** Only the row changes; the file stays. */
  async removeLogo(id: string): Promise<Developer> {
    const current = await this.developers.findById(id);
    if (!current) throw notFound();
    if (current.logoPath) {
      await this.developers.setLogo(id, null, new Date());
    }
    return this.get(id);
  }

  /** The logo with the headers every download carries (nosniff, and a CSP for SVG). */
  async openLogo(id: string): Promise<FileDownload> {
    const key = (await this.developers.findById(id))?.logoPath;
    if (!key) throw notFound();
    return this.files.openDownload(key);
  }
}
