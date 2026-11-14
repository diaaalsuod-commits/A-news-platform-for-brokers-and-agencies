import { Inject, Injectable } from '@nestjs/common';
import type {
  ExpectedHandover,
  OwnershipType,
  ProjectStage,
  PublishStatus,
  RecordStatus,
} from '@reih/contracts';
import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  containsPattern,
  DATABASE,
  type DatabaseTransaction,
} from '../../../shared/database/index.js';
import type { LngLat } from '../domain/uae-bounds.js';
import {
  areas,
  developers,
  mediaFiles,
  projectAmenities,
  projects,
  projectSalesContacts,
  projectVerifications,
} from './content.schema.js';

export interface ProjectSummaryRow {
  id: string;
  nameAr: string;
  nameEn: string;
  developerId: string;
  developerNameAr: string;
  developerNameEn: string;
  developerStatus: RecordStatus;
  communityId: string;
  communityNameAr: string;
  communityNameEn: string;
  communityIsActive: boolean;
  stage: ProjectStage;
  status: PublishStatus;
  lastVerifiedAt: Date | null;
  lastVerificationSource: string | null;
  updatedAt: Date;
}

export interface ProjectRow extends ProjectSummaryRow {
  descriptionAr: string | null;
  descriptionEn: string | null;
  lng: number;
  lat: number;
  expectedLaunchDate: string | null;
  handoverQuarter: number | null;
  handoverYear: number | null;
  actualHandoverDate: string | null;
  ownershipType: OwnershipType;
  leaseTermYears: number | null;
  serviceChargeAedSqm: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

/** The project as a locked transaction sees it: what the rules of FR-DAT-04 and FR-DAT-05 read. */
export interface LockedProject {
  status: PublishStatus;
  developerId: string;
  communityId: string;
  location: LngLat;
  stage: ProjectStage;
  expectedHandover: ExpectedHandover | null;
  ownershipType: OwnershipType;
  leaseTermYears: number | null;
  lastVerifiedAt: Date | null;
}

/** The columns a create or an edit writes; the location is turned into a geography point. */
export interface ProjectValues {
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  developerId?: string;
  communityId?: string;
  location?: LngLat;
  stage?: ProjectStage;
  expectedLaunchDate?: string | null;
  expectedHandover?: ExpectedHandover | null;
  actualHandoverDate?: string | null;
  ownershipType?: OwnershipType;
  leaseTermYears?: number | null;
  serviceChargeAedPerSqm?: string | null;
}

const pointOf = ({ lng, lat }: LngLat) =>
  sql<string>`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

/** Request names to column names; a field left out stays out. */
function toColumns(values: ProjectValues) {
  const { location, expectedHandover, serviceChargeAedPerSqm, ...rest } = values;
  return {
    ...rest,
    ...(location ? { location: pointOf(location) } : {}),
    ...(expectedHandover !== undefined
      ? {
          handoverQuarter: expectedHandover?.quarter ?? null,
          handoverYear: expectedHandover?.year ?? null,
        }
      : {}),
    ...(serviceChargeAedPerSqm !== undefined
      ? { serviceChargeAedSqm: serviceChargeAedPerSqm }
      : {}),
  };
}

const summaryColumns = {
  id: projects.id,
  nameAr: projects.nameAr,
  nameEn: projects.nameEn,
  developerId: projects.developerId,
  developerNameAr: developers.nameAr,
  developerNameEn: developers.nameEn,
  developerStatus: developers.status,
  communityId: projects.communityId,
  communityNameAr: areas.nameAr,
  communityNameEn: areas.nameEn,
  communityIsActive: areas.isActive,
  stage: projects.stage,
  status: projects.status,
  lastVerifiedAt: projects.lastVerifiedAt,
  lastVerificationSource: projects.lastVerificationSource,
  updatedAt: projects.updatedAt,
};

const detailColumns = {
  ...summaryColumns,
  descriptionAr: projects.descriptionAr,
  descriptionEn: projects.descriptionEn,
  lng: sql<number>`ST_X(${projects.location}::geometry)`.mapWith(Number),
  lat: sql<number>`ST_Y(${projects.location}::geometry)`.mapWith(Number),
  expectedLaunchDate: projects.expectedLaunchDate,
  handoverQuarter: projects.handoverQuarter,
  handoverYear: projects.handoverYear,
  actualHandoverDate: projects.actualHandoverDate,
  ownershipType: projects.ownershipType,
  leaseTermYears: projects.leaseTermYears,
  serviceChargeAedSqm: projects.serviceChargeAedSqm,
  publishedAt: projects.publishedAt,
  createdAt: projects.createdAt,
};

/** BR-14: a non-blank source and license; the SQL twin of isLicensed in domain/project.ts. */
export const licensedMedia = sql`btrim(${mediaFiles.sourceNote}) <> '' AND btrim(${mediaFiles.licenseNote}) <> ''`;

/** FR-DAT-04, FR-DAT-05, FR-DAT-10: projects as the Data Operator manages them. */
@Injectable()
export class ProjectRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  // ---------------------------------------------------------------- reads

  /** By English name, then id, so pages are stable. q matches either name. */
  async list(filter: {
    page: number;
    pageSize: number;
    q?: string;
    status?: PublishStatus;
    stage?: ProjectStage;
    developerId?: string;
    communityId?: string;
  }): Promise<{ items: ProjectSummaryRow[]; total: number }> {
    const where = and(
      filter.status ? eq(projects.status, filter.status) : undefined,
      filter.stage ? eq(projects.stage, filter.stage) : undefined,
      filter.developerId ? eq(projects.developerId, filter.developerId) : undefined,
      filter.communityId ? eq(projects.communityId, filter.communityId) : undefined,
      filter.q
        ? or(
            ilike(projects.nameEn, containsPattern(filter.q)),
            ilike(projects.nameAr, containsPattern(filter.q)),
          )
        : undefined,
    );
    return this.page(where, [asc(projects.nameEn), asc(projects.id)], filter);
  }

  /**
   * FR-DAT-10: draft and published projects never verified or verified before the cutoff,
   * never-verified first, then the oldest verification first.
   */
  async needsVerification(filter: {
    page: number;
    pageSize: number;
    status?: 'draft' | 'published';
    cutoff: Date;
  }): Promise<{ items: ProjectSummaryRow[]; total: number }> {
    const where = and(
      filter.status
        ? eq(projects.status, filter.status)
        : inArray(projects.status, ['draft', 'published']),
      or(isNull(projects.lastVerifiedAt), lt(projects.lastVerifiedAt, filter.cutoff)),
    );
    return this.page(
      where,
      [sql`${projects.lastVerifiedAt} ASC NULLS FIRST`, asc(projects.nameEn), asc(projects.id)],
      filter,
    );
  }

  private async page(
    where: SQL | undefined,
    order: SQL[],
    filter: { page: number; pageSize: number },
  ): Promise<{ items: ProjectSummaryRow[]; total: number }> {
    const [items, [totals]] = await Promise.all([
      this.db
        .select(summaryColumns)
        .from(projects)
        .innerJoin(developers, eq(developers.id, projects.developerId))
        .innerJoin(areas, eq(areas.id, projects.communityId))
        .where(where)
        .orderBy(...order)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(projects).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async findById(id: string): Promise<ProjectRow | null> {
    const [row] = await this.db
      .select(detailColumns)
      .from(projects)
      .innerJoin(developers, eq(developers.id, projects.developerId))
      .innerJoin(areas, eq(areas.id, projects.communityId))
      .where(eq(projects.id, id));
    return row ?? null;
  }

  async amenityIds(
    projectId: string,
    tx: NodePgDatabase | DatabaseTransaction = this.db,
  ): Promise<string[]> {
    const rows = await tx
      .select({ amenityId: projectAmenities.amenityId })
      .from(projectAmenities)
      .where(eq(projectAmenities.projectId, projectId))
      .orderBy(asc(projectAmenities.amenityId));
    return rows.map((row) => row.amenityId);
  }

  // ---------------------------------------------------------------- writes, in one transaction

  transaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  /**
   * The project, locked FOR UPDATE until the transaction ends. Lock order (docs/decisions.md,
   * P4.2): the project row first, then its developer FOR SHARE.
   */
  async lock(tx: DatabaseTransaction, id: string): Promise<LockedProject | null> {
    const [row] = await tx
      .select({
        status: projects.status,
        developerId: projects.developerId,
        communityId: projects.communityId,
        lng: sql<number>`ST_X(${projects.location}::geometry)`.mapWith(Number),
        lat: sql<number>`ST_Y(${projects.location}::geometry)`.mapWith(Number),
        stage: projects.stage,
        handoverQuarter: projects.handoverQuarter,
        handoverYear: projects.handoverYear,
        ownershipType: projects.ownershipType,
        leaseTermYears: projects.leaseTermYears,
        lastVerifiedAt: projects.lastVerifiedAt,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .for('update');
    if (!row) return null;
    const { lng, lat, handoverQuarter, handoverYear, ...rest } = row;
    return {
      ...rest,
      location: { lng, lat },
      expectedHandover:
        handoverQuarter !== null && handoverYear !== null
          ? { quarter: handoverQuarter, year: handoverYear }
          : null,
    };
  }

  /**
   * The developer's status, read FOR SHARE: an archive (which locks the row FOR UPDATE) waits for
   * this transaction, and this one waits for an archive already under way. Null when none.
   */
  async developerStatus(
    tx: DatabaseTransaction,
    developerId: string,
  ): Promise<RecordStatus | null> {
    const [row] = await tx
      .select({ status: developers.status })
      .from(developers)
      .where(eq(developers.id, developerId))
      .for('share');
    return row?.status ?? null;
  }

  /** The area's level and active flag, read FOR SHARE so it is not deleted meanwhile. */
  async area(
    tx: DatabaseTransaction,
    id: string,
  ): Promise<{ level: 'emirate' | 'community'; isActive: boolean } | null> {
    const [row] = await tx
      .select({ level: areas.level, isActive: areas.isActive })
      .from(areas)
      .where(eq(areas.id, id))
      .for('share');
    return row ?? null;
  }

  /** BR-14: images with a recorded source and license. */
  async licensedImageCount(tx: DatabaseTransaction, projectId: string): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.projectId, projectId), eq(mediaFiles.type, 'image'), licensedMedia));
    return row?.total ?? 0;
  }

  async assignedContactCount(tx: DatabaseTransaction, projectId: string): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(projectSalesContacts)
      .where(eq(projectSalesContacts.projectId, projectId));
    return row?.total ?? 0;
  }

  async insert(
    tx: DatabaseTransaction,
    values: Required<
      Pick<
        ProjectValues,
        'nameAr' | 'nameEn' | 'developerId' | 'communityId' | 'location' | 'stage' | 'ownershipType'
      >
    > &
      ProjectValues,
    userId: string,
  ): Promise<string> {
    const [row] = await tx
      .insert(projects)
      .values({
        ...toColumns(values),
        nameAr: values.nameAr,
        nameEn: values.nameEn,
        developerId: values.developerId,
        communityId: values.communityId,
        location: pointOf(values.location),
        stage: values.stage,
        ownershipType: values.ownershipType,
        // FR-DAT-04: a new project is always a draft.
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
      })
      .returning({ id: projects.id });
    return (row as { id: string }).id;
  }

  async update(
    tx: DatabaseTransaction,
    id: string,
    values: ProjectValues,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx
      .update(projects)
      .set({ ...toColumns(values), updatedBy: userId, updatedAt: now })
      .where(eq(projects.id, id));
  }

  /** Makes the project's amenities exactly this set. */
  async replaceAmenities(
    tx: DatabaseTransaction,
    projectId: string,
    amenityIds: readonly string[],
  ): Promise<void> {
    await tx
      .delete(projectAmenities)
      .where(
        and(
          eq(projectAmenities.projectId, projectId),
          amenityIds.length > 0
            ? notInArray(projectAmenities.amenityId, [...amenityIds])
            : undefined,
        ),
      );
    if (amenityIds.length > 0) {
      await tx
        .insert(projectAmenities)
        .values(amenityIds.map((amenityId) => ({ projectId, amenityId })))
        .onConflictDoNothing();
    }
  }

  /** UC-05.5: publish sets the status and the publish time; unpublish and archive keep that time. */
  async setStatus(
    tx: DatabaseTransaction,
    id: string,
    status: PublishStatus,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx
      .update(projects)
      .set({
        status,
        ...(status === 'published' ? { publishedAt: now } : {}),
        updatedBy: userId,
        updatedAt: now,
      })
      .where(eq(projects.id, id));
  }

  /**
   * FR-DAT-10: stores the verification and moves the project's last verification to it, unless
   * a later one is already recorded. On the same date the newer entry wins. GREATEST ignores NULL,
   * and every SET expression reads the row as it was before the update.
   */
  async verify(
    tx: DatabaseTransaction,
    input: { projectId: string; verifiedAt: Date; source: string; notes: string | null },
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx.insert(projectVerifications).values({
      projectId: input.projectId,
      verifiedAt: input.verifiedAt,
      source: input.source,
      notes: input.notes,
      verifiedBy: userId,
    });
    await tx
      .update(projects)
      .set({
        lastVerificationSource: sql`CASE WHEN ${projects.lastVerifiedAt} IS NULL OR ${input.verifiedAt.toISOString()}::timestamptz >= ${projects.lastVerifiedAt} THEN ${input.source} ELSE ${projects.lastVerificationSource} END`,
        lastVerifiedAt: sql`GREATEST(${projects.lastVerifiedAt}, ${input.verifiedAt.toISOString()}::timestamptz)`,
        updatedBy: userId,
        updatedAt: now,
      })
      .where(eq(projects.id, input.projectId));
  }
}
