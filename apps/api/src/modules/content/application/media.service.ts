import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import type {
  Media,
  MediaListQuery,
  MediaListResponse,
  MediaUploadFields,
  UpdateMediaRequest,
} from '@reih/contracts';
import type { DatabaseTransaction } from '../../../shared/database/index.js';
import { type FileDownload, FileStorage } from '../../../shared/files/index.js';
import { MEDIA_DIRECTORY, mediaFileUrl, uploadRuleOf } from '../domain/media.js';
import { isLicensed } from '../domain/project.js';
import { MediaRepository, type MediaRow } from '../infrastructure/media.repository.js';
import { type LockedProject, ProjectRepository } from '../infrastructure/project.repository.js';
import { defined, notFound } from './errors.js';
import { projectArchived } from './project.service.js';
import { PublishGate } from './publish-gate.js';

function toMedia(row: MediaRow): Media {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    displayOrder: row.displayOrder,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    sourceNote: row.sourceNote,
    licenseNote: row.licenseNote,
    fileUrl: mediaFileUrl(row.projectId, row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const countsAsLicensedImage = (media: Pick<MediaRow, 'type' | 'sourceNote' | 'licenseNote'>) =>
  media.type === 'image' && isLicensed(media);

/**
 * FR-DAT-06, UC-05.7: a project's images, plans, brochures and videos. Every write runs with the
 * project row locked FOR UPDATE, as publishing does, so a publish never counts an image that is
 * being deleted. An archived project's media cannot change (Q4).
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly media: MediaRepository,
    private readonly projects: ProjectRepository,
    private readonly gate: PublishGate,
    private readonly files: FileStorage,
  ) {}

  async list(projectId: string, query: MediaListQuery): Promise<MediaListResponse> {
    if ((await this.media.projectStatus(projectId)) === null) throw notFound();
    const { items, total } = await this.media.list({ ...query, projectId });
    return { items: items.map(toMedia), total, page: query.page, pageSize: query.pageSize };
  }

  async get(projectId: string, mediaId: string): Promise<Media> {
    const row = await this.media.find(projectId, mediaId);
    if (!row) throw notFound();
    return toMedia(row);
  }

  /**
   * The fields were checked before the first byte arrived (readFileWithFields). An unknown or
   * archived project is refused before anything is stored. The file is judged by its bytes and its
   * size while it streams; the client's file name is never used. If anything fails after the file
   * is stored, the file is removed, so nothing stays on disk without its row.
   */
  async upload(
    projectId: string,
    fields: MediaUploadFields,
    file: Readable,
    userId: string,
  ): Promise<Media> {
    const status = await this.media.projectStatus(projectId);
    if (status === null) throw notFound();
    if (status === 'archived') throw projectArchived();

    const stored = await this.files.save(file, {
      directory: MEDIA_DIRECTORY,
      ...uploadRuleOf(fields.type),
    });
    let mediaId: string;
    try {
      mediaId = await this.projects.transaction(async (tx) => {
        await this.lockEditable(tx, projectId);
        return this.media.insert(tx, {
          projectId,
          type: fields.type,
          title: fields.title,
          filePath: stored.key,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          displayOrder: fields.displayOrder ?? 0,
          sourceNote: fields.sourceNote,
          licenseNote: fields.licenseNote,
          uploadedBy: userId,
        });
      });
    } catch (error) {
      await this.files.remove(stored.key);
      throw error;
    }
    return this.get(projectId, mediaId);
  }

  /** Only the fields sent change. A published project must keep a licensed image (Q1). */
  async update(projectId: string, mediaId: string, changes: UpdateMediaRequest): Promise<Media> {
    await this.projects.transaction(async (tx) => {
      const project = await this.lockEditable(tx, projectId);
      const current = await this.media.find(projectId, mediaId, tx);
      if (!current) throw notFound();
      const after = { ...current, ...defined(changes) };
      await this.assertKeepsLicensedImage(tx, projectId, project, current, after);
      await this.media.update(tx, mediaId, defined(changes), new Date());
    });
    return this.get(projectId, mediaId);
  }

  /**
   * Deletes the row only; the file stays on disk, as for logos, because a catalog queued earlier
   * may still use it (docs/decisions.md, P4.2). A published project must keep a licensed image.
   */
  async delete(projectId: string, mediaId: string): Promise<void> {
    await this.projects.transaction(async (tx) => {
      const project = await this.lockEditable(tx, projectId);
      const current = await this.media.find(projectId, mediaId, tx);
      if (!current) throw notFound();
      await this.assertKeepsLicensedImage(tx, projectId, project, current, null);
      await this.media.delete(tx, mediaId);
    });
  }

  /** Behind the session, with the stored type, nosniff and private caching. */
  async openFile(projectId: string, mediaId: string): Promise<FileDownload> {
    const row = await this.media.find(projectId, mediaId);
    if (!row) throw notFound();
    return this.files.openDownload(row.filePath);
  }

  /** The project row FOR UPDATE; unknown is 404 and archived is 409 PROJECT_ARCHIVED. */
  private async lockEditable(tx: DatabaseTransaction, projectId: string): Promise<LockedProject> {
    const project = await this.projects.lock(tx, projectId);
    if (!project) throw notFound();
    if (project.status === 'archived') throw projectArchived();
    return project;
  }

  /** Q1: refuses with 422 PUBLISH_BLOCKED a change that would leave a published project without one. */
  private async assertKeepsLicensedImage(
    tx: DatabaseTransaction,
    projectId: string,
    project: LockedProject,
    before: MediaRow,
    after: MediaRow | null,
  ): Promise<void> {
    if (project.status !== 'published') return;
    const lost = countsAsLicensedImage(before) && !(after && countsAsLicensedImage(after));
    if (!lost) return;
    const remaining = (await this.projects.licensedImageCount(tx, projectId)) - 1;
    await this.gate.assertStillPublishable(tx, projectId, project, remaining);
  }
}
