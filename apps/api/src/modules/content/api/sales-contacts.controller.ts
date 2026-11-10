import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateSalesContactRequest,
  createSalesContactRequestSchema,
  idParamSchema,
  type SalesContactDetail,
  type SalesContactListQuery,
  type SalesContactListResponse,
  salesContactListQuerySchema,
  type UpdateSalesContactRequest,
  updateSalesContactRequestSchema,
} from '@reih/contracts';
import { Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { SalesContactService } from '../application/sales-contact.service.js';

const id = new ZodValidationPipe(idParamSchema);

/**
 * FR-DAT-02, UC-05.2: sales contacts, numbers included, for Data Operators only (FR-CNT-01).
 * There is no delete: a contact is deactivated, because reveal logs point at it.
 */
@Roles('data_operator')
@Controller('content/sales-contacts')
export class SalesContactsController {
  constructor(private readonly contacts: SalesContactService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(salesContactListQuerySchema)) query: SalesContactListQuery,
  ): Promise<SalesContactListResponse> {
    return this.contacts.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createSalesContactRequestSchema)) body: CreateSalesContactRequest,
  ): Promise<SalesContactDetail> {
    return this.contacts.create(body);
  }

  @Get(':id')
  get(@Param('id', id) contactId: string): Promise<SalesContactDetail> {
    return this.contacts.get(contactId);
  }

  /** isActive: false deactivates the contact; projectIds replaces its assigned projects. */
  @Patch(':id')
  update(
    @Param('id', id) contactId: string,
    @Body(new ZodValidationPipe(updateSalesContactRequestSchema)) body: UpdateSalesContactRequest,
  ): Promise<SalesContactDetail> {
    return this.contacts.update(contactId, body);
  }
}
