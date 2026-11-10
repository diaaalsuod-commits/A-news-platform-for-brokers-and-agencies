import { Inject, Injectable } from '@nestjs/common';
import type { RecordStatus } from '@reih/contracts';
import {
  and,
  asc,
  count,
  eq,
  exists,
  ilike,
  inArray,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  containsPattern,
  DATABASE,
  type DatabaseTransaction,
} from '../../../shared/database/index.js';
import { developers, projects, projectSalesContacts, salesContacts } from './content.schema.js';

/** A sales contact as the Data Operator manages it, numbers included. */
export interface SalesContactRow {
  id: string;
  developerId: string;
  developerNameAr: string;
  developerNameEn: string;
  developerStatus: RecordStatus;
  fullName: string;
  title: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  languages: string[];
  verifiedAt: string | null;
  verificationSource: string | null;
  isActive: boolean;
  projectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesContactValues {
  developerId?: string;
  fullName?: string;
  title?: string | null;
  phone?: string;
  whatsapp?: string | null;
  email?: string | null;
  languages?: string[];
  verifiedAt?: string | null;
  verificationSource?: string | null;
  isActive?: boolean;
}

/** What a broker may see before a reveal (FR-PRJ-07): never a number or an email. */
export interface PublicContactRow {
  id: string;
  fullName: string;
  title: string | null;
  languages: string[];
}

/** The numbers, for the reveal only (FR-CNT-01). */
export interface RevealedContactRow extends PublicContactRow {
  phone: string;
  whatsapp: string | null;
  email: string | null;
}

const managementColumns = {
  id: salesContacts.id,
  developerId: salesContacts.developerId,
  developerNameAr: developers.nameAr,
  developerNameEn: developers.nameEn,
  developerStatus: developers.status,
  fullName: salesContacts.fullName,
  title: salesContacts.title,
  phone: salesContacts.phone,
  whatsapp: salesContacts.whatsapp,
  email: salesContacts.email,
  languages: salesContacts.languages,
  verifiedAt: salesContacts.verifiedAt,
  verificationSource: salesContacts.verificationSource,
  isActive: salesContacts.isActive,
  projectCount: sql<number>`(
    SELECT count(*)::int FROM ${projectSalesContacts}
    WHERE ${projectSalesContacts.salesContactId} = ${salesContacts.id}
  )`.mapWith(Number),
  createdAt: salesContacts.createdAt,
  updatedAt: salesContacts.updatedAt,
};

/** FR-CNT-01: the columns the Seller tab gets. Phone, WhatsApp and email are not selected at all. */
const publicColumns = {
  id: salesContacts.id,
  fullName: salesContacts.fullName,
  title: salesContacts.title,
  languages: salesContacts.languages,
};

const revealColumns = {
  ...publicColumns,
  phone: salesContacts.phone,
  whatsapp: salesContacts.whatsapp,
  email: salesContacts.email,
};

/** An active contact, assigned to this project, and the project is published (BR-08). */
const visibleOn = (projectId: string) =>
  and(
    eq(projectSalesContacts.projectId, projectId),
    eq(salesContacts.isActive, true),
    eq(projects.status, 'published'),
  );

/** FR-DAT-02: sales contacts and the projects they are assigned to. */
@Injectable()
export class SalesContactRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  // ---------------------------------------------------------------- management (Data Operator)

  /**
   * By name, then id, so pages are stable. q matches the name or the title, never a number or an
   * email: the request URL is logged.
   */
  async list(filter: {
    page: number;
    pageSize: number;
    q?: string;
    developerId?: string;
    projectId?: string;
    active?: boolean;
  }): Promise<{ items: SalesContactRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      filter.developerId ? eq(salesContacts.developerId, filter.developerId) : undefined,
      filter.active === undefined ? undefined : eq(salesContacts.isActive, filter.active),
      filter.projectId
        ? exists(
            this.db
              .select({ one: sql`1` })
              .from(projectSalesContacts)
              .where(
                and(
                  eq(projectSalesContacts.salesContactId, salesContacts.id),
                  eq(projectSalesContacts.projectId, filter.projectId),
                ),
              ),
          )
        : undefined,
      filter.q
        ? or(
            ilike(salesContacts.fullName, containsPattern(filter.q)),
            ilike(salesContacts.title, containsPattern(filter.q)),
          )
        : undefined,
    ];
    const where = and(...conditions);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(managementColumns)
        .from(salesContacts)
        .innerJoin(developers, eq(developers.id, salesContacts.developerId))
        .where(where)
        .orderBy(asc(salesContacts.fullName), asc(salesContacts.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(salesContacts).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async findById(id: string): Promise<SalesContactRow | null> {
    const [row] = await this.db
      .select(managementColumns)
      .from(salesContacts)
      .innerJoin(developers, eq(developers.id, salesContacts.developerId))
      .where(eq(salesContacts.id, id));
    return row ?? null;
  }

  /** The projects a contact is assigned to, by English name. */
  async projectsOf(contactId: string): Promise<{ id: string; nameAr: string; nameEn: string }[]> {
    return this.db
      .select({ id: projects.id, nameAr: projects.nameAr, nameEn: projects.nameEn })
      .from(projectSalesContacts)
      .innerJoin(projects, eq(projects.id, projectSalesContacts.projectId))
      .where(eq(projectSalesContacts.salesContactId, contactId))
      .orderBy(asc(projects.nameEn), asc(projects.id));
  }

  // ---------------------------------------------------------------- writes, in one transaction

  /** A contact and its assignments change together or not at all. */
  transaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  /** The contact, locked until the transaction ends, so two edits cannot interleave. */
  async lock(
    tx: DatabaseTransaction,
    id: string,
  ): Promise<{
    developerId: string;
    verifiedAt: string | null;
    verificationSource: string | null;
  } | null> {
    const [row] = await tx
      .select({
        developerId: salesContacts.developerId,
        verifiedAt: salesContacts.verifiedAt,
        verificationSource: salesContacts.verificationSource,
      })
      .from(salesContacts)
      .where(eq(salesContacts.id, id))
      .for('update');
    return row ?? null;
  }

  /** True when the developer exists. The shared lock keeps it from being deleted meanwhile. */
  async developerExists(tx: DatabaseTransaction, developerId: string): Promise<boolean> {
    const rows = await tx
      .select({ id: developers.id })
      .from(developers)
      .where(eq(developers.id, developerId))
      .for('share');
    return rows.length > 0;
  }

  async assignedProjectIds(tx: DatabaseTransaction, contactId: string): Promise<string[]> {
    const rows = await tx
      .select({ projectId: projectSalesContacts.projectId })
      .from(projectSalesContacts)
      .where(eq(projectSalesContacts.salesContactId, contactId));
    return rows.map((row) => row.projectId);
  }

  /**
   * The projects among these ids, each with its developer. The shared lock keeps a project's
   * developer from changing until the assignment is stored.
   */
  async projectDevelopers(
    tx: DatabaseTransaction,
    projectIds: readonly string[],
  ): Promise<{ id: string; developerId: string }[]> {
    if (projectIds.length === 0) return [];
    return tx
      .select({ id: projects.id, developerId: projects.developerId })
      .from(projects)
      .where(inArray(projects.id, [...projectIds]))
      .for('share');
  }

  async insert(
    tx: DatabaseTransaction,
    values: SalesContactValues & { developerId: string; fullName: string; phone: string },
  ): Promise<string> {
    const [row] = await tx.insert(salesContacts).values(values).returning({ id: salesContacts.id });
    return (row as { id: string }).id;
  }

  async update(
    tx: DatabaseTransaction,
    id: string,
    values: SalesContactValues,
    now: Date,
  ): Promise<void> {
    await tx
      .update(salesContacts)
      .set({ ...values, updatedAt: now })
      .where(eq(salesContacts.id, id));
  }

  /** Makes the contact's assigned projects exactly this set. */
  async replaceProjects(
    tx: DatabaseTransaction,
    contactId: string,
    projectIds: readonly string[],
  ): Promise<void> {
    await tx
      .delete(projectSalesContacts)
      .where(
        and(
          eq(projectSalesContacts.salesContactId, contactId),
          projectIds.length > 0
            ? notInArray(projectSalesContacts.projectId, [...projectIds])
            : undefined,
        ),
      );
    if (projectIds.length > 0) {
      await tx
        .insert(projectSalesContacts)
        .values(projectIds.map((projectId) => ({ projectId, salesContactId: contactId })))
        .onConflictDoNothing();
    }
  }

  // ---------------------------------------------------------------- reads for other modules

  /** FR-PRJ-07, FR-DAT-02: the active contacts of a published project, without their numbers. */
  async listVisible(projectId: string): Promise<PublicContactRow[]> {
    return this.db
      .select(publicColumns)
      .from(projectSalesContacts)
      .innerJoin(salesContacts, eq(salesContacts.id, projectSalesContacts.salesContactId))
      .innerJoin(projects, eq(projects.id, projectSalesContacts.projectId))
      .where(visibleOn(projectId))
      .orderBy(asc(salesContacts.fullName), asc(salesContacts.id));
  }

  /** FR-CNT-01: one active contact of a published project, with its numbers, or null. */
  async findVisible(contactId: string, projectId: string): Promise<RevealedContactRow | null> {
    const [row] = await this.db
      .select(revealColumns)
      .from(projectSalesContacts)
      .innerJoin(salesContacts, eq(salesContacts.id, projectSalesContacts.salesContactId))
      .innerJoin(projects, eq(projects.id, projectSalesContacts.projectId))
      .where(and(visibleOn(projectId), eq(salesContacts.id, contactId)));
    return row ?? null;
  }
}
