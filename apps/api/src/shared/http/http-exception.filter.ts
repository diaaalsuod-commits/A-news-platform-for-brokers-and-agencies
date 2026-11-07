import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { messages } from '@reih/i18n';
import type { Request, Response } from 'express';
import { localeFromAcceptLanguage } from '../localization/index.js';
import { AppError, type ErrorCode } from './app-error.js';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Gives every failed request the same body, in the caller's language (CLAUDE.md, API conventions). */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { code, status, details } = this.describe(exception);

    if (response.headersSent) {
      response.end();
      return;
    }
    const language = localeFromAcceptLanguage(request.headers['accept-language']);
    response.status(status).json({
      error: { code, message: messages[language].errors[code], details },
    });
  }

  private describe(exception: unknown): {
    code: ErrorCode;
    status: number;
    details: Record<string, unknown>;
  } {
    if (exception instanceof AppError) {
      return exception;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status < 500) {
        return { code: CODE_BY_STATUS[status] ?? 'BAD_REQUEST', status, details: {} };
      }
      const code = CODE_BY_STATUS[status];
      if (code) {
        return { code, status, details: {} };
      }
    }
    // Unexpected: the log gets everything, the caller gets nothing about the cause.
    this.logger.error(exception);
    return { code: 'INTERNAL_ERROR', status: HttpStatus.INTERNAL_SERVER_ERROR, details: {} };
  }
}
