import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  idParamSchema,
  MEDIA_MAX_BYTES,
  MEDIA_NOTE_MAX,
  type Media,
  mediaFileField,
  type MediaListQuery,
  mediaListQuerySchema,
  type MediaListResponse,
  mediaUploadFieldsSchema,
  type UpdateMediaRequest,
  updateMediaRequestSchema,
} from '@reih/contracts';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  readFileWithFields,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { MediaService } from '../application/media.service.js';

const id = new ZodValidationPipe(idParamSchema);
/** The largest upload of any media type; each type's own limit is applied while it streams. */
const LARGEST_MEDIA = Math.max(...Object.values(MEDIA_MAX_BYTES));
/** A note of MEDIA_NOTE_MAX characters, at up to 4 bytes each in UTF-8. */
const MAX_FIELD_BYTES = MEDIA_NOTE_MAX * 4;

/** FR-DAT-06, UC-05.7: a project's media. Content is global, so nothing is scoped to an agency. */
@Roles('data_operator')
@Controller('content/projects/:projectId/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @Param('projectId', id) projectId: string,
    @Query(new ZodValidationPipe(mediaListQuerySchema)) query: MediaListQuery,
  ): Promise<MediaListResponse> {
    return this.media.list(projectId, query);
  }

  /**
   * multipart/form-data: the fields type, title, displayOrder (optional), sourceNote and
   * licenseNote first, then the file in the "file" field. A form without a source or a license
   * note is refused before any byte is stored.
   */
  @Post()
  upload(
    @Param('projectId', id) projectId: string,
    @Req() request: Request,
    @CurrentUser() user: RequestUser,
  ): Promise<Media> {
    return readFileWithFields(
      request,
      {
        field: mediaFileField,
        maxBytes: LARGEST_MEDIA,
        fields: mediaUploadFieldsSchema,
        maxFields: 5,
        maxFieldBytes: MAX_FIELD_BYTES,
      },
      (fields, file) => this.media.upload(projectId, fields, file, user.id),
    );
  }

  @Patch(':mediaId')
  update(
    @Param('projectId', id) projectId: string,
    @Param('mediaId', id) mediaId: string,
    @Body(new ZodValidationPipe(updateMediaRequestSchema)) body: UpdateMediaRequest,
  ): Promise<Media> {
    return this.media.update(projectId, mediaId, body);
  }

  /** The row only; the file stays on disk. */
  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', id) projectId: string,
    @Param('mediaId', id) mediaId: string,
  ): Promise<void> {
    return this.media.delete(projectId, mediaId);
  }

  /** Behind the session, for Data Operators; never cached by a shared cache. */
  @Get(':mediaId/file')
  async file(
    @Param('projectId', id) projectId: string,
    @Param('mediaId', id) mediaId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, headers } = await this.media.openFile(projectId, mediaId);
    response.set({ ...headers, 'Cache-Control': 'private' });
    return new StreamableFile(stream, { type: headers['Content-Type'] });
  }
}
