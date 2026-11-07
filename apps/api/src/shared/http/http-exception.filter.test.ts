import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  type INestApplication,
  Post,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { messages } from '@reih/i18n';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './app-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const bodySchema = z.object({ name: z.string().min(1), age: z.number().int() });

@Controller()
class SampleController {
  @Get('app-error')
  appError(): void {
    throw new AppError('CONFLICT', HttpStatus.CONFLICT, { field: 'email' });
  }

  @Get('forbidden')
  forbidden(): void {
    throw new ForbiddenException('internal wording that must not reach the caller');
  }

  @Get('crash')
  crash(): void {
    throw new Error('password=secret-value in a database error');
  }

  @Post('validated')
  validated(@Body(new ZodValidationPipe(bodySchema)) body: z.output<typeof bodySchema>) {
    return body;
  }
}

describe('HttpExceptionFilter and ZodValidationPipe', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SampleController],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());

  const get = (path: string, language?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return language ? call.set('Accept-Language', language) : call;
  };

  it('answers an AppError with its code, status and details', async () => {
    const response = await get('/app-error').expect(409);
    expect(response.body).toEqual({
      error: {
        code: 'CONFLICT',
        message: messages.en.errors.CONFLICT,
        details: { field: 'email' },
      },
    });
  });

  it('answers in Arabic when the caller asks for it', async () => {
    const response = await get('/app-error', 'ar-AE,ar;q=0.9,en;q=0.8').expect(409);
    expect(response.body.error.message).toBe(messages.ar.errors.CONFLICT);
  });

  it('answers in English for a language it does not have', async () => {
    const response = await get('/app-error', 'fr').expect(409);
    expect(response.body.error.message).toBe(messages.en.errors.CONFLICT);
  });

  it('gives a Nest exception a code and replaces its wording', async () => {
    const response = await get('/forbidden', 'ar').expect(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: messages.ar.errors.FORBIDDEN, details: {} },
    });
  });

  it('answers an unknown route with NOT_FOUND', async () => {
    const response = await get('/no-such-route').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('NFR-08 tells the caller nothing about an unexpected error', async () => {
    const response = await get('/crash').expect(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: messages.en.errors.INTERNAL_ERROR, details: {} },
    });
    expect(JSON.stringify(response.body)).not.toContain('secret-value');
  });

  it('answers malformed JSON with BAD_REQUEST', async () => {
    const response = await request(app.getHttpServer())
      .post('/validated')
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('NFR-08 the pipe refuses invalid input and names the fields, not the values', async () => {
    const response = await request(app.getHttpServer())
      .post('/validated')
      .set('Accept-Language', 'ar')
      .send({ name: '', age: 'old' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.message).toBe(messages.ar.errors.VALIDATION_FAILED);
    expect(response.body.error.details.issues.map((issue: { path: string }) => issue.path)).toEqual(
      ['name', 'age'],
    );
    expect(JSON.stringify(response.body)).not.toContain('old');
  });

  it('the pipe returns the parsed value and drops unknown fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/validated')
      .send({ name: 'Sara', age: 30, role: 'platform_admin' })
      .expect(201);
    expect(response.body).toEqual({ name: 'Sara', age: 30 });
  });
});
