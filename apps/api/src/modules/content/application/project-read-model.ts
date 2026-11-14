import { Injectable } from '@nestjs/common';
import {
  type PublishedMedia,
  type PublishedProject,
  ProjectReadRepository,
} from '../infrastructure/project-read.repository.js';

export type { PublishedMedia, PublishedProject };

/**
 * The content module's read side for explore, project-query and catalog (CLAUDE.md, module
 * table). Only published projects (BR-08) and only media with a recorded source and license
 * (BR-14); every query lives in content. More methods come with the modules that need them.
 */
@Injectable()
export class ProjectReadModel {
  constructor(private readonly repository: ProjectReadRepository) {}

  /** The project, or null when there is none or it is not published. */
  findPublished(projectId: string): Promise<PublishedProject | null> {
    return this.repository.findPublished(projectId);
  }

  /** Its licensed media by display order; empty when the project is not published. */
  listPublishedMedia(projectId: string): Promise<PublishedMedia[]> {
    return this.repository.listPublishedMedia(projectId);
  }
}
