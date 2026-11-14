import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type CreatePaymentPlanRequest,
  createPaymentPlanRequestSchema,
  idParamSchema,
  type PaymentPlan,
  type PaymentPlanListQuery,
  paymentPlanListQuerySchema,
  type PaymentPlanListResponse,
  type UpdatePaymentPlanRequest,
  updatePaymentPlanRequestSchema,
} from '@reih/contracts';
import { Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { PaymentPlanService } from '../application/payment-plan.service.js';

const id = new ZodValidationPipe(idParamSchema);

/** FR-DAT-07, UC-05.8: a project's payment plans. Content is global, so nothing is scoped to an agency. */
@Roles('data_operator')
@Controller('content/projects/:projectId/payment-plans')
export class PaymentPlansController {
  constructor(private readonly plans: PaymentPlanService) {}

  @Get()
  list(
    @Param('projectId', id) projectId: string,
    @Query(new ZodValidationPipe(paymentPlanListQuerySchema)) query: PaymentPlanListQuery,
  ): Promise<PaymentPlanListResponse> {
    return this.plans.list(projectId, query);
  }

  @Post()
  create(
    @Param('projectId', id) projectId: string,
    @Body(new ZodValidationPipe(createPaymentPlanRequestSchema)) body: CreatePaymentPlanRequest,
  ): Promise<PaymentPlan> {
    return this.plans.create(projectId, body);
  }

  @Get(':planId')
  get(
    @Param('projectId', id) projectId: string,
    @Param('planId', id) planId: string,
  ): Promise<PaymentPlan> {
    return this.plans.get(projectId, planId);
  }

  /** Replaces the name and the whole set of milestones. */
  @Put(':planId')
  update(
    @Param('projectId', id) projectId: string,
    @Param('planId', id) planId: string,
    @Body(new ZodValidationPipe(updatePaymentPlanRequestSchema)) body: UpdatePaymentPlanRequest,
  ): Promise<PaymentPlan> {
    return this.plans.update(projectId, planId, body);
  }

  @Post(':planId/default')
  @HttpCode(HttpStatus.OK)
  makeDefault(
    @Param('projectId', id) projectId: string,
    @Param('planId', id) planId: string,
  ): Promise<PaymentPlan> {
    return this.plans.makeDefault(projectId, planId);
  }

  @Delete(':planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', id) projectId: string,
    @Param('planId', id) planId: string,
  ): Promise<void> {
    return this.plans.delete(projectId, planId);
  }
}
