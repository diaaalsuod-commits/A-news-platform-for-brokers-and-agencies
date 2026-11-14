import { HttpStatus } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';
import { PassThrough, type Readable } from 'node:stream';
import type { z } from 'zod';
import { AppError } from './app-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export interface SingleFileOptions {
  /** The form field that carries the file. */
  field: string;
  /** The largest file accepted, in bytes. The stream fails on the first byte beyond it. */
  maxBytes: number;
}

export interface FileWithFieldsOptions<S extends z.ZodType> extends SingleFileOptions {
  /** The text fields, checked when the file part starts; use a .strict() schema. */
  fields: S;
  /** The most text fields the form may carry. */
  maxFields: number;
  /** The longest text field accepted, in bytes. */
  maxFieldBytes: number;
}

const invalidUpload = (reason: string) =>
  new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, {
    issues: [{ path: 'file', code: reason }],
  });

const invalidField = (path: string, reason: string) =>
  new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, { issues: [{ path, code: reason }] });

interface UploadOptions extends SingleFileOptions {
  maxFields: number;
  maxFieldBytes: number;
}

/**
 * The one busboy loop behind both readers. Text fields must come before the file part, so they
 * are known before the first byte of the file is stored. The client's file name is never read.
 *
 * The consumer reads the file through a stream that ends only once the whole form has been read
 * without a refusal, so it never finishes storing a file that the request then refuses (a field
 * after the file, a second file). Any refusal, and a client that disconnects before the request
 * ends, destroys that stream: the consumer's pipeline fails and removes its partial file, and the
 * promise rejects only after the consumer has finished.
 */
function readUpload<T>(
  request: Request,
  options: UploadOptions,
  consume: (fields: Record<string, string>, file: Readable) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: request.headers,
        limits: {
          files: 1,
          fields: options.maxFields,
          fieldSize: options.maxFieldBytes,
          // One byte over the limit, so busboy marks the file truncated and the size check fails.
          fileSize: options.maxBytes + 1,
        },
      });
    } catch {
      reject(invalidUpload('not_multipart'));
      return;
    }

    const fields: Record<string, string> = {};
    let settled = false;
    let fileSeen = false;
    let fileEnded = false;
    let formClosed = false;
    let file: PassThrough | undefined;
    let work: Promise<T> | undefined;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      request.unpipe(parser);
      request.resume();
      if (file && work) {
        file.destroy(error instanceof Error ? error : new Error(String(error)));
        const rejectAfter = () => reject(error);
        work.then(rejectAfter, rejectAfter);
      } else {
        reject(error);
      }
    };
    const endFileWhenFormIsRead = () => {
      if (file && fileEnded && formClosed && !settled) file.end();
    };

    parser.on('file', (name, stream) => {
      if (name !== options.field || fileSeen || settled) {
        stream.resume();
        fail(invalidUpload('unexpected_field'));
        return;
      }
      fileSeen = true;
      const body = new PassThrough();
      // The consumer's pipeline listens for errors itself; this keeps a destroy after a consumer
      // that stopped reading (refused fields) from becoming an uncaught exception.
      body.on('error', () => undefined);
      file = body;
      stream.on('limit', () => {
        stream.destroy(new AppError('FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE));
      });
      stream.on('error', (error) => body.destroy(error));
      stream.on('end', () => {
        fileEnded = true;
        endFileWhenFormIsRead();
      });
      stream.pipe(body, { end: false });
      try {
        work = consume({ ...fields }, body);
      } catch (error) {
        body.resume();
        fail(error);
        return;
      }
      work.then((result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      }, fail);
    });
    parser.on('field', (name, value, info) => {
      if (fileSeen) {
        fail(invalidField(name, 'after_file'));
      } else if (Object.hasOwn(fields, name)) {
        fail(invalidField(name, 'duplicate'));
      } else if (info.valueTruncated || info.nameTruncated) {
        fail(invalidField(name, 'too_long'));
      } else {
        fields[name] = value;
      }
    });
    parser.on('filesLimit', () => fail(invalidUpload('too_many_files')));
    parser.on('fieldsLimit', () => fail(invalidUpload('unexpected_field')));
    parser.on('error', () => fail(invalidUpload('malformed')));
    parser.on('close', () => {
      formClosed = true;
      if (!fileSeen) {
        fail(invalidUpload('missing_file'));
      }
      endFileWhenFormIsRead();
    });
    request.once('close', () => {
      if (!request.complete) fail(invalidUpload('aborted'));
    });

    request.pipe(parser);
  });
}

/**
 * Reads one file from a multipart/form-data request and hands its stream to consume, which must
 * read it to the end (FileStorage.save does). Nothing is buffered in memory: the size limit is
 * enforced while the bytes arrive, and any other field or a second file refuses the request.
 */
export function readSingleFile<T>(
  request: Request,
  options: SingleFileOptions,
  consume: (file: Readable) => Promise<T>,
): Promise<T> {
  return readUpload(request, { ...options, maxFields: 0, maxFieldBytes: 0 }, (_fields, file) =>
    consume(file),
  );
}

/**
 * Like readSingleFile, with text fields that must all come before the file part. They are checked
 * with the schema when the file part starts, so a refused form stores nothing: its file is drained
 * and the request answers 400 VALIDATION_FAILED. A field after the file, a repeated field, or one
 * longer than maxFieldBytes is refused too.
 */
export function readFileWithFields<S extends z.ZodType, T>(
  request: Request,
  options: FileWithFieldsOptions<S>,
  consume: (fields: z.output<S>, file: Readable) => Promise<T>,
): Promise<T> {
  const validate = new ZodValidationPipe(options.fields);
  return readUpload(request, options, (raw, file) => {
    let fields: z.output<S>;
    try {
      fields = validate.transform(raw);
    } catch (error) {
      file.resume();
      return Promise.reject(error);
    }
    return consume(fields, file);
  });
}
