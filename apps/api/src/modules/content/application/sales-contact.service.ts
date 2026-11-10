import { Injectable } from '@nestjs/common';
import type {
  CreateSalesContactRequest,
  SalesContact,
  SalesContactDetail,
  SalesContactListQuery,
  SalesContactListResponse,
  UpdateSalesContactRequest,
} from '@reih/contracts';
import { assignmentIssue, verificationIssue } from '../domain/sales-contact.js';
import {
  SalesContactRepository,
  type SalesContactRow,
  type SalesContactValues,
} from '../infrastructure/sales-contact.repository.js';
import { assertNoIssue, defined, notFound, validationFailed } from './errors.js';

function toSalesContact(row: SalesContactRow): SalesContact {
  return {
    id: row.id,
    developer: {
      id: row.developerId,
      nameAr: row.developerNameAr,
      nameEn: row.developerNameEn,
      status: row.developerStatus,
    },
    fullName: row.fullName,
    title: row.title,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    languages: row.languages,
    verifiedAt: row.verifiedAt,
    verificationSource: row.verificationSource,
    isActive: row.isActive,
    projectCount: row.projectCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The columns of a request, without projectIds, which is not a column. */
function columnsOf({ projectIds: _projectIds, ...columns }: UpdateSalesContactRequest) {
  return defined(columns) as SalesContactValues;
}

/**
 * FR-DAT-02: sales contacts, managed by Data Operators. These are the only endpoints, besides the
 * reveal (FR-CNT-01), whose responses carry a phone number, a WhatsApp number or an email.
 */
@Injectable()
export class SalesContactService {
  constructor(private readonly contacts: SalesContactRepository) {}

  async list(query: SalesContactListQuery): Promise<SalesContactListResponse> {
    const { items, total } = await this.contacts.list(query);
    return { items: items.map(toSalesContact), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<SalesContactDetail> {
    const row = await this.contacts.findById(id);
    if (!row) throw notFound();
    return { ...toSalesContact(row), projects: await this.contacts.projectsOf(id) };
  }

  /** The contact and its assigned projects are stored in one transaction. */
  async create(input: CreateSalesContactRequest): Promise<SalesContactDetail> {
    const projectIds = input.projectIds ?? [];
    assertNoIssue(
      verificationIssue(
        {
          verifiedAt: input.verifiedAt ?? null,
          verificationSource: input.verificationSource ?? null,
        },
        new Date(),
      ),
    );

    const id = await this.contacts.transaction(async (tx) => {
      if (!(await this.contacts.developerExists(tx, input.developerId))) {
        throw validationFailed({ path: 'developerId', code: 'not_found' });
      }
      assertNoIssue(
        assignmentIssue({
          developerId: input.developerId,
          wanted: projectIds,
          found: await this.contacts.projectDevelopers(tx, projectIds),
          projectIdsSent: true,
        }),
      );
      const contactId = await this.contacts.insert(tx, {
        ...columnsOf(input),
        developerId: input.developerId,
        fullName: input.fullName,
        phone: input.phone,
      });
      await this.contacts.replaceProjects(tx, contactId, projectIds);
      return contactId;
    });
    return this.get(id);
  }

  /**
   * Only the fields sent change; projectIds, when sent, replaces the whole set. Everything happens
   * in one transaction with the contact locked, and what is checked is the contact as it will be:
   * every assigned project belongs to its developer. So a change of developer alone is refused
   * while projects of the old developer are still assigned.
   */
  async update(id: string, changes: UpdateSalesContactRequest): Promise<SalesContactDetail> {
    await this.contacts.transaction(async (tx) => {
      const current = await this.contacts.lock(tx, id);
      if (!current) throw notFound();

      assertNoIssue(
        verificationIssue(
          {
            verifiedAt: changes.verifiedAt === undefined ? current.verifiedAt : changes.verifiedAt,
            verificationSource:
              changes.verificationSource === undefined
                ? current.verificationSource
                : changes.verificationSource,
          },
          new Date(),
        ),
      );

      const developerId = changes.developerId ?? current.developerId;
      const developerChanged = developerId !== current.developerId;
      if (developerChanged && !(await this.contacts.developerExists(tx, developerId))) {
        throw validationFailed({ path: 'developerId', code: 'not_found' });
      }

      const projectIdsSent = changes.projectIds !== undefined;
      if (projectIdsSent || developerChanged) {
        const wanted = changes.projectIds ?? (await this.contacts.assignedProjectIds(tx, id));
        assertNoIssue(
          assignmentIssue({
            developerId,
            wanted,
            found: await this.contacts.projectDevelopers(tx, wanted),
            projectIdsSent,
          }),
        );
      }

      await this.contacts.update(tx, id, columnsOf(changes), new Date());
      if (changes.projectIds !== undefined) {
        await this.contacts.replaceProjects(tx, id, changes.projectIds);
      }
    });
    return this.get(id);
  }
}
