import { Injectable } from '@nestjs/common';
import { SalesContactRepository } from '../infrastructure/sales-contact.repository.js';

/** FR-PRJ-07: a sales manager as the Seller tab shows one before a reveal. No number, no email. */
export interface SellerContact {
  id: string;
  fullName: string;
  title: string | null;
  languages: string[];
}

/** FR-CNT-01: the numbers of one contact, for the reveal only. */
export interface ContactDetails extends SellerContact {
  phone: string;
  whatsapp: string | null;
  email: string | null;
}

/**
 * The content module's sales contacts for the other modules (CLAUDE.md rule 2).
 *
 * Both methods answer only for a published project (BR-08) and an active contact assigned to it
 * (FR-DAT-02); anything else gives an empty list or null. findForProject is the only exported
 * method that returns a phone number, a WhatsApp number or an email, and only the contact
 * module's reveal may call it (FR-CNT-01, BR-10).
 */
@Injectable()
export class SalesContactReader {
  constructor(private readonly contacts: SalesContactRepository) {}

  /** Name, title and languages of the project's active contacts, by name. Never their numbers. */
  listForProject(projectId: string): Promise<SellerContact[]> {
    return this.contacts.listVisible(projectId);
  }

  /** The contact with its numbers, or null. For the reveal only. */
  findForProject(contactId: string, projectId: string): Promise<ContactDetails | null> {
    return this.contacts.findVisible(contactId, projectId);
  }
}
