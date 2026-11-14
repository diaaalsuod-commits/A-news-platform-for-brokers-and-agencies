import { Inject, Injectable } from '@nestjs/common';
import type { MediaType, PublishStatus } from '@reih/contracts';
import { and, asc, count, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE, type DatabaseTransaction } from '../../../shared/database/index.js';
import { mediaFiles, projects } from './content.schema.js';

export interface MediaRow {
  id: string;
  projectId: string;
  type: MediaType;
  title: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  displayOrder: number;
  sourceNote: string;
  licenseNote: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaValues {
  title?: string;
  displayOrder?: number;
  sourceNote?: string;
  licenseNote?: string;
}

const columns = {
  id: mediaFiles.id,
  projectId: mediaFiles.projectId,
  type: mediaFiles.type,
  title: mediaFiles.title,
  filePath: mediaFiles.filePath,
  mimeType: mediaFiles.mimeType,
  sizeBytes: mediaFiles.sizeBytes,
  displayOrder: mediaFiles.displayOrder,
  sourceNote: mediaFiles.sourceNote,
  licenseNote: mediaFiles.licenseNote,
  createdAt: mediaFiles.createdAt,
  updatedAt: mediaFiles.updatedAt,
};

/** FR-DAT-06: a project's media files. Writes run with the project row locked (ProjectRepository.lock). */
@Injectable()
export class MediaRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** The project's status, or null when there is none; read without a lock, before an upload streams. */
  async projectStatus(projectId: string): Promise<PublishStatus | null> {
    const [row] = await this.db
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId));
    return row?.status ?? null;
  }

  /** By display order, then upload time and id, so pages are stable. */
  async list(filter: {
    projectId: string;
    page: number;
    pageSize: number;
    type?: MediaType;
  }): Promise<{ items: MediaRow[]; total: number }> {
    const where = and(
      eq(mediaFiles.projectId, filter.projectId),
      filter.type ? eq(mediaFiles.type, filter.type) : undefined,
    );
    const [items, [totals]] = await Promise.all([
      this.db
        .select(columns)
        .from(mediaFiles)
        .where(where)
        .orderBy(asc(mediaFiles.displayOrder), asc(mediaFiles.createdAt), asc(mediaFiles.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(mediaFiles).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  /** One media file of this project, or null; another project's id is not found. */
  async find(
    projectId: string,
    mediaId: string,
    tx: NodePgDatabase | DatabaseTransaction = this.db,
  ): Promise<MediaRow | null> {
    const [row] = await tx
      .select(columns)
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.projectId, projectId)));
    return row ?? null;
  }

  async insert(
    tx: DatabaseTransaction,
    values: {
      projectId: string;
      type: MediaType;
      title: string;
      filePath: string;
      mimeType: string;
      sizeBytes: number;
      displayOrder: number;
      sourceNote: string;
      licenseNote: string;
      uploadedBy: string;
    },
  ): Promise<string> {
    const [row] = await tx.insert(mediaFiles).values(values).returning({ id: mediaFiles.id });
    return (row as { id: string }).id;
  }

  async update(tx: DatabaseTransaction, mediaId: string, values: MediaValues, now: Date) {
    await tx
      .update(mediaFiles)
      .set({ ...values, updatedAt: now })
      .where(eq(mediaFiles.id, mediaId));
  }

  /** The row only: the file stays on disk (docs/decisions.md, P4.2). */
  async delete(tx: DatabaseTransaction, mediaId: string): Promise<void> {
    await tx.delete(mediaFiles).where(eq(mediaFiles.id, mediaId));
  }
}
