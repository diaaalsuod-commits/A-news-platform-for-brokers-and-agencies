import { Inject, Injectable } from '@nestjs/common';
import type { ExpectedHandover, MediaType, OwnershipType, ProjectStage } from '@reih/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { areas, developers, mediaFiles, projectAmenities, projects } from './content.schema.js';
import { licensedMedia } from './project.repository.js';

/** A published project as the broker-facing modules read it. It carries no contact details. */
export interface PublishedProject {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  developer: { id: string; nameAr: string; nameEn: string };
  community: { id: string; nameAr: string; nameEn: string };
  location: { lng: number; lat: number };
  stage: ProjectStage;
  expectedLaunchDate: string | null;
  expectedHandover: ExpectedHandover | null;
  actualHandoverDate: string | null;
  ownershipType: OwnershipType;
  leaseTermYears: number | null;
  /** AED per m², a decimal string (BR-03). */
  serviceChargeAedPerSqm: string | null;
  amenityIds: string[];
  publishedAt: Date;
  lastVerifiedAt: Date;
  lastVerificationSource: string;
}

/** A licensed media file of a published project (BR-14). fileKey is for a signed link later. */
export interface PublishedMedia {
  id: string;
  type: MediaType;
  title: string;
  displayOrder: number;
  mimeType: string;
  sizeBytes: number;
  fileKey: string;
}

const community = alias(areas, 'community');
const published = eq(projects.status, 'published');

/**
 * The SQL behind ProjectReadModel. Every query filters on status = 'published' (BR-08) and media
 * on a recorded source and license (BR-14). No query selects a sales contact.
 */
@Injectable()
export class ProjectReadRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async findPublished(projectId: string): Promise<PublishedProject | null> {
    const [row] = await this.db
      .select({
        id: projects.id,
        nameAr: projects.nameAr,
        nameEn: projects.nameEn,
        descriptionAr: projects.descriptionAr,
        descriptionEn: projects.descriptionEn,
        developerId: developers.id,
        developerNameAr: developers.nameAr,
        developerNameEn: developers.nameEn,
        communityId: community.id,
        communityNameAr: community.nameAr,
        communityNameEn: community.nameEn,
        lng: sql<number>`ST_X(${projects.location}::geometry)`.mapWith(Number),
        lat: sql<number>`ST_Y(${projects.location}::geometry)`.mapWith(Number),
        stage: projects.stage,
        expectedLaunchDate: projects.expectedLaunchDate,
        handoverQuarter: projects.handoverQuarter,
        handoverYear: projects.handoverYear,
        actualHandoverDate: projects.actualHandoverDate,
        ownershipType: projects.ownershipType,
        leaseTermYears: projects.leaseTermYears,
        serviceChargeAedSqm: projects.serviceChargeAedSqm,
        publishedAt: projects.publishedAt,
        lastVerifiedAt: projects.lastVerifiedAt,
        lastVerificationSource: projects.lastVerificationSource,
      })
      .from(projects)
      .innerJoin(developers, eq(developers.id, projects.developerId))
      .innerJoin(community, eq(community.id, projects.communityId))
      .where(and(eq(projects.id, projectId), published));
    if (!row) return null;

    const amenityRows = await this.db
      .select({ amenityId: projectAmenities.amenityId })
      .from(projectAmenities)
      .where(eq(projectAmenities.projectId, projectId))
      .orderBy(asc(projectAmenities.amenityId));

    return {
      id: row.id,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      descriptionAr: row.descriptionAr,
      descriptionEn: row.descriptionEn,
      developer: { id: row.developerId, nameAr: row.developerNameAr, nameEn: row.developerNameEn },
      community: { id: row.communityId, nameAr: row.communityNameAr, nameEn: row.communityNameEn },
      location: { lng: row.lng, lat: row.lat },
      stage: row.stage,
      expectedLaunchDate: row.expectedLaunchDate,
      expectedHandover:
        row.handoverQuarter !== null && row.handoverYear !== null
          ? { quarter: row.handoverQuarter, year: row.handoverYear }
          : null,
      actualHandoverDate: row.actualHandoverDate,
      ownershipType: row.ownershipType,
      leaseTermYears: row.leaseTermYears,
      serviceChargeAedPerSqm: row.serviceChargeAedSqm,
      amenityIds: amenityRows.map((amenity) => amenity.amenityId),
      // A published project always has both (FR-DAT-05); the database does not say so.
      publishedAt: row.publishedAt as Date,
      lastVerifiedAt: row.lastVerifiedAt as Date,
      lastVerificationSource: row.lastVerificationSource as string,
    };
  }

  async listPublishedMedia(projectId: string): Promise<PublishedMedia[]> {
    return this.db
      .select({
        id: mediaFiles.id,
        type: mediaFiles.type,
        title: mediaFiles.title,
        displayOrder: mediaFiles.displayOrder,
        mimeType: mediaFiles.mimeType,
        sizeBytes: mediaFiles.sizeBytes,
        fileKey: mediaFiles.filePath,
      })
      .from(mediaFiles)
      .innerJoin(projects, eq(projects.id, mediaFiles.projectId))
      .where(and(eq(mediaFiles.projectId, projectId), published, licensedMedia))
      .orderBy(asc(mediaFiles.displayOrder), asc(mediaFiles.createdAt), asc(mediaFiles.id));
  }
}
