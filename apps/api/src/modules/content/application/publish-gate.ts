import { HttpStatus, Injectable } from '@nestjs/common';
import type { PublishBlocker } from '@reih/contracts';
import type { DatabaseTransaction } from '../../../shared/database/index.js';
import { AppError } from '../../../shared/http/index.js';
import { publishBlockers } from '../domain/project.js';
import { type LockedProject, ProjectRepository } from '../infrastructure/project.repository.js';

/** 422 PUBLISH_BLOCKED with every missing item by its stable code (FR-DAT-05, UC-05.6). */
export const publishBlocked = (blockers: PublishBlocker[]) =>
  new AppError('PUBLISH_BLOCKED', HttpStatus.UNPROCESSABLE_ENTITY, { blockers });

/**
 * FR-DAT-05: the publishing check, run inside a transaction that already holds the project row
 * FOR UPDATE. It reads the developer FOR SHARE (lock order in docs/decisions.md, P4.2), so a
 * developer archive under way finishes first and is seen, and one that starts later waits.
 */
@Injectable()
export class PublishGate {
  constructor(private readonly projects: ProjectRepository) {}

  async blockersOf(
    tx: DatabaseTransaction,
    projectId: string,
    project: Pick<
      LockedProject,
      'developerId' | 'communityId' | 'location' | 'stage' | 'expectedHandover' | 'lastVerifiedAt'
    >,
    licensedImageCount?: number,
  ): Promise<PublishBlocker[]> {
    return publishBlockers({
      developerStatus: await this.projects.developerStatus(tx, project.developerId),
      communityId: project.communityId,
      location: project.location,
      stage: project.stage,
      expectedHandover: project.expectedHandover,
      licensedImageCount:
        licensedImageCount ?? (await this.projects.licensedImageCount(tx, projectId)),
      lastVerifiedAt: project.lastVerifiedAt,
    });
  }

  /**
   * Q1 of P4.2: a published project must stay publishable. Called with the project as a change
   * would leave it; refuses the change with 422 PUBLISH_BLOCKED when it would create a blocker.
   */
  async assertStillPublishable(
    tx: DatabaseTransaction,
    projectId: string,
    after: Parameters<PublishGate['blockersOf']>[2] & { status: LockedProject['status'] },
    licensedImageCount?: number,
  ): Promise<void> {
    if (after.status !== 'published') return;
    const blockers = await this.blockersOf(tx, projectId, after, licensedImageCount);
    if (blockers.length > 0) throw publishBlocked(blockers);
  }
}
