import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  NeedsVerificationQuery,
  ProjectListResponse,
  VerifyProjectRequest,
} from '@reih/contracts';
import { EventBus, ProjectPublished, ProjectUnpublished } from '../../../shared/events/index.js';
import { AppError } from '../../../shared/http/index.js';
import { uaeDayStart } from '../../../shared/localization/index.js';
import { SettingsReader } from '../../admin/index.js';
import {
  type ProjectTransition,
  staleCutoff,
  transitionRefusal,
  verificationDateIssue,
} from '../domain/project.js';
import { type LockedProject, ProjectRepository } from '../infrastructure/project.repository.js';
import { assertNoIssue, notFound } from './errors.js';
import { projectArchived, toProjectSummary } from './project.service.js';
import { publishBlocked, PublishGate } from './publish-gate.js';

/**
 * UC-05.5 Publish Project (FR-DAT-05, BR-08), status changes (FR-DAT-04) and verification
 * (FR-DAT-10). Each change runs in one transaction with the project row locked FOR UPDATE; the
 * events are published only after it commits.
 */
@Injectable()
export class ProjectPublishingService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly gate: PublishGate,
    private readonly events: EventBus,
    private readonly settings: SettingsReader,
  ) {}

  /**
   * UC-05.5: refused with 422 PUBLISH_BLOCKED and every missing item; otherwise published, with
   * the publish time, and ProjectPublished once committed.
   */
  async publish(id: string, userId: string): Promise<void> {
    await this.transition(id, 'publish', async (tx, project) => {
      const blockers = await this.gate.blockersOf(tx, id, project);
      if (blockers.length > 0) throw publishBlocked(blockers);
      await this.projects.setStatus(tx, id, 'published', userId, new Date());
    });
    await this.events.publish(new ProjectPublished(id));
  }

  /** Back to draft; brokers stop seeing it (BR-08). */
  async unpublish(id: string, userId: string): Promise<void> {
    await this.transition(id, 'unpublish', async (tx) => {
      await this.projects.setStatus(tx, id, 'draft', userId, new Date());
    });
    await this.events.publish(new ProjectUnpublished(id));
  }

  /**
   * Archived from draft or published; read-only from then on. ProjectUnpublished is published only
   * when the project was published: a draft was never visible to brokers.
   */
  async archive(id: string, userId: string): Promise<void> {
    const wasPublished = await this.transition(id, 'archive', async (tx, project) => {
      await this.projects.setStatus(tx, id, 'archived', userId, new Date());
      return project.status === 'published';
    });
    if (wasPublished) await this.events.publish(new ProjectUnpublished(id));
  }

  /**
   * FR-DAT-10: records a verification on a UAE calendar day, today or earlier, and moves the
   * project's last verification to it at once unless a later one is recorded (00:00 UAE time).
   */
  async verify(id: string, input: VerifyProjectRequest, userId: string): Promise<void> {
    assertNoIssue(verificationDateIssue(input.date, new Date()));
    await this.projects.transaction(async (tx) => {
      const project = await this.projects.lock(tx, id);
      if (!project) throw notFound();
      if (project.status === 'archived') throw projectArchived();
      await this.projects.verify(
        tx,
        {
          projectId: id,
          verifiedAt: uaeDayStart(input.date),
          source: input.source,
          notes: input.notes ?? null,
        },
        userId,
        new Date(),
      );
    });
  }

  /**
   * FR-DAT-10: draft and published projects that are stale under the threshold of the moment
   * (FR-ADM-06), never-verified first, then the oldest verification first.
   */
  async needsVerification(query: NeedsVerificationQuery): Promise<ProjectListResponse> {
    const { staleThresholdDays } = await this.settings.get();
    const { items, total } = await this.projects.needsVerification({
      ...query,
      cutoff: staleCutoff(staleThresholdDays, new Date()),
    });
    return {
      items: items.map(toProjectSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async transition<T>(
    id: string,
    transition: ProjectTransition,
    work: (
      tx: Parameters<Parameters<ProjectRepository['transaction']>[0]>[0],
      project: LockedProject,
    ) => Promise<T>,
  ): Promise<T> {
    return this.projects.transaction(async (tx) => {
      const project = await this.projects.lock(tx, id);
      if (!project) throw notFound();
      const refusal = transitionRefusal(project.status, transition);
      if (refusal) throw new AppError(refusal, HttpStatus.CONFLICT);
      return work(tx, project);
    });
  }
}
