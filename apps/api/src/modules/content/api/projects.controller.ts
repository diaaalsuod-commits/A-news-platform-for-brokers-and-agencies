import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateProjectRequest,
  createProjectRequestSchema,
  idParamSchema,
  type NeedsVerificationQuery,
  needsVerificationQuerySchema,
  type Project,
  type ProjectListQuery,
  projectListQuerySchema,
  type ProjectListResponse,
  type UpdateProjectRequest,
  updateProjectRequestSchema,
  type VerifyProjectRequest,
  verifyProjectRequestSchema,
} from '@reih/contracts';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { ProjectPublishingService } from '../application/project-publishing.service.js';
import { ProjectService } from '../application/project.service.js';

const id = new ZodValidationPipe(idParamSchema);

/**
 * FR-DAT-04, FR-DAT-05, FR-DAT-10, UC-05.4, UC-05.5, UC-05.10: projects. Content is global, so
 * nothing here is scoped to an agency.
 */
@Roles('data_operator')
@Controller('content/projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectService,
    private readonly publishing: ProjectPublishingService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(projectListQuerySchema)) query: ProjectListQuery,
  ): Promise<ProjectListResponse> {
    return this.projects.list(query);
  }

  /** Declared before :id, so the path is never read as a project id. */
  @Get('needs-verification')
  needsVerification(
    @Query(new ZodValidationPipe(needsVerificationQuerySchema)) query: NeedsVerificationQuery,
  ): Promise<ProjectListResponse> {
    return this.publishing.needsVerification(query);
  }

  /** A new project is always a draft. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createProjectRequestSchema)) body: CreateProjectRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    return this.projects.create(body, user.id);
  }

  @Get(':id')
  get(@Param('id', id) projectId: string): Promise<Project> {
    return this.projects.get(projectId);
  }

  @Patch(':id')
  update(
    @Param('id', id) projectId: string,
    @Body(new ZodValidationPipe(updateProjectRequestSchema)) body: UpdateProjectRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    return this.projects.update(projectId, body, user.id);
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  async verify(
    @Param('id', id) projectId: string,
    @Body(new ZodValidationPipe(verifyProjectRequestSchema)) body: VerifyProjectRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    await this.publishing.verify(projectId, body, user.id);
    return this.projects.get(projectId);
  }

  /** 422 PUBLISH_BLOCKED with details.blockers when anything is missing (UC-05.5). */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('id', id) projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    await this.publishing.publish(projectId, user.id);
    return this.projects.get(projectId);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(
    @Param('id', id) projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    await this.publishing.unpublish(projectId, user.id);
    return this.projects.get(projectId);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @Param('id', id) projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Project> {
    await this.publishing.archive(projectId, user.id);
    return this.projects.get(projectId);
  }
}
