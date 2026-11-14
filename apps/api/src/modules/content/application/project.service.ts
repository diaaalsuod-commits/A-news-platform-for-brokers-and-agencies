import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateProjectRequest,
  Project,
  ProjectListQuery,
  ProjectListResponse,
  ProjectSummary,
  UpdateProjectRequest,
} from '@reih/contracts';
import type { DatabaseTransaction } from '../../../shared/database/index.js';
import { AppError } from '../../../shared/http/index.js';
import { uaeDate } from '../../../shared/localization/index.js';
import { ReferenceDataReader } from '../../admin/index.js';
import { ownershipIssue } from '../domain/project.js';
import {
  ProjectRepository,
  type ProjectRow,
  type ProjectSummaryRow,
  type ProjectValues,
} from '../infrastructure/project.repository.js';
import { assertNoIssue, defined, notFound, validationFailed } from './errors.js';
import { PublishGate } from './publish-gate.js';

export const projectArchived = () => new AppError('PROJECT_ARCHIVED', HttpStatus.CONFLICT);

export function toProjectSummary(row: ProjectSummaryRow): ProjectSummary {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    developer: {
      id: row.developerId,
      nameAr: row.developerNameAr,
      nameEn: row.developerNameEn,
      status: row.developerStatus,
    },
    community: {
      id: row.communityId,
      nameAr: row.communityNameAr,
      nameEn: row.communityNameEn,
      isActive: row.communityIsActive,
    },
    stage: row.stage,
    status: row.status,
    lastVerifiedAt: row.lastVerifiedAt ? uaeDate(row.lastVerifiedAt) : null,
    lastVerificationSource: row.lastVerificationSource,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProject(row: ProjectRow, amenityIds: string[]): Project {
  return {
    ...toProjectSummary(row),
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    location: { lng: row.lng, lat: row.lat },
    expectedLaunchDate: row.expectedLaunchDate,
    expectedHandover:
      row.handoverQuarter !== null && row.handoverYear !== null
        ? { quarter: row.handoverQuarter, year: row.handoverYear }
        : null,
    actualHandoverDate: row.actualHandoverDate,
    ownershipType: row.ownershipType,
    leaseTermYears: row.leaseTermYears,
    serviceChargeAedPerSqm: row.serviceChargeAedSqm,
    amenityIds,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The columns of a request, without amenityIds, which is not a column. */
function columnsOf({ amenityIds: _amenityIds, ...columns }: UpdateProjectRequest): ProjectValues {
  return defined(columns) as ProjectValues;
}

/**
 * FR-DAT-04, UC-05.4: projects, managed by Data Operators. A new project is a draft; its status
 * changes only through ProjectPublishingService. An archived project is read-only.
 */
@Injectable()
export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly gate: PublishGate,
    private readonly referenceData: ReferenceDataReader,
  ) {}

  async list(query: ProjectListQuery): Promise<ProjectListResponse> {
    const { items, total } = await this.projects.list(query);
    return {
      items: items.map(toProjectSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<Project> {
    const row = await this.projects.findById(id);
    if (!row) throw notFound();
    return toProject(row, await this.projects.amenityIds(id));
  }

  async create(input: CreateProjectRequest, userId: string): Promise<Project> {
    assertNoIssue(
      ownershipIssue({
        ownershipType: input.ownershipType,
        leaseTermYears: input.leaseTermYears ?? null,
      }),
    );
    const amenityIds = input.amenityIds ?? [];
    await this.assertSelectableAmenities(amenityIds);

    const id = await this.projects.transaction(async (tx) => {
      await this.assertSelectableDeveloper(tx, input.developerId);
      await this.assertSelectableCommunity(tx, input.communityId);
      const projectId = await this.projects.insert(
        tx,
        {
          ...columnsOf(input),
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          developerId: input.developerId,
          communityId: input.communityId,
          location: input.location,
          stage: input.stage,
          ownershipType: input.ownershipType,
        },
        userId,
      );
      await this.projects.replaceAmenities(tx, projectId, amenityIds);
      return projectId;
    });
    return this.get(id);
  }

  /**
   * Only the fields sent change; amenityIds, when sent, replaces the whole set. Everything happens
   * in one transaction with the project row locked, and what is checked is the project as it will
   * be. The expected launch date is never touched by a change of stage.
   */
  async update(id: string, changes: UpdateProjectRequest, userId: string): Promise<Project> {
    await this.projects.transaction(async (tx) => {
      const current = await this.projects.lock(tx, id);
      if (!current) throw notFound();
      if (current.status === 'archived') throw projectArchived();

      assertNoIssue(
        ownershipIssue({
          ownershipType: changes.ownershipType ?? current.ownershipType,
          leaseTermYears:
            changes.leaseTermYears === undefined ? current.leaseTermYears : changes.leaseTermYears,
        }),
      );

      const developerId = changes.developerId ?? current.developerId;
      if (developerId !== current.developerId) {
        // The mirror of FR-DAT-02's rule (P4.1): clear the contact assignments first.
        if ((await this.projects.assignedContactCount(tx, id)) > 0) {
          throw validationFailed({ path: 'developerId', code: 'has_assigned_contacts' });
        }
        // Read FOR SHARE in this transaction, after the project row lock (P4.2, addition A).
        await this.assertSelectableDeveloper(tx, developerId);
      }
      const communityId = changes.communityId ?? current.communityId;
      if (communityId !== current.communityId) {
        await this.assertSelectableCommunity(tx, communityId);
      }
      if (changes.amenityIds !== undefined) {
        const kept = new Set(await this.projects.amenityIds(id, tx));
        await this.assertSelectableAmenities(changes.amenityIds.filter((a) => !kept.has(a)));
      }

      await this.gate.assertStillPublishable(tx, id, {
        status: current.status,
        developerId,
        communityId,
        location: changes.location ?? current.location,
        stage: changes.stage ?? current.stage,
        expectedHandover:
          changes.expectedHandover === undefined
            ? current.expectedHandover
            : changes.expectedHandover,
        lastVerifiedAt: current.lastVerifiedAt,
      });

      await this.projects.update(tx, id, columnsOf(changes), userId, new Date());
      if (changes.amenityIds !== undefined) {
        await this.projects.replaceAmenities(tx, id, changes.amenityIds);
      }
    });
    return this.get(id);
  }

  /** A new or changed developer must exist and be active (FR-DAT-01). */
  private async assertSelectableDeveloper(tx: DatabaseTransaction, developerId: string) {
    const status = await this.projects.developerStatus(tx, developerId);
    if (status === null) throw validationFailed({ path: 'developerId', code: 'not_found' });
    if (status !== 'active') throw validationFailed({ path: 'developerId', code: 'archived' });
  }

  /** FR-DAT-03: a project's area is a community; a deactivated one is refused in a new choice. */
  private async assertSelectableCommunity(tx: DatabaseTransaction, communityId: string) {
    const area = await this.projects.area(tx, communityId);
    if (!area) throw validationFailed({ path: 'communityId', code: 'not_found' });
    if (area.level !== 'community') {
      throw validationFailed({ path: 'communityId', code: 'not_community' });
    }
    if (!area.isActive) throw validationFailed({ path: 'communityId', code: 'inactive' });
  }

  /** FR-ADM-04: a new amenity must be active; one the project already has may stay. */
  private async assertSelectableAmenities(amenityIds: readonly string[]) {
    if (!(await this.referenceData.areActive('amenities', amenityIds))) {
      throw validationFailed({ path: 'amenityIds', code: 'inactive_or_unknown' });
    }
  }
}
