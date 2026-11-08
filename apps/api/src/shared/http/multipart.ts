import { HttpStatus } from '@nestjs/common';
import busboy from 'busboy';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { AppError } from './app-error.js';

export interface SingleFileOptions {
  /** The form field that carries the file. */
  field: string;
  /** The largest file accepted, in bytes. The stream fails on the first byte beyond it. */
  maxBytes: number;
}

const invalidUpload = (reason: string) =>
  new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, {
    issues: [{ path: 'file', code: reason }],
  });

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
  return new Promise<T>((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: request.headers,
        // One byte over the limit, so busboy marks the file truncated and the size check fails.
        limits: { files: 1, fields: 0, fileSize: options.maxBytes + 1 },
      });
    } catch {
      reject(invalidUpload('not_multipart'));
      return;
    }

    let settled = false;
    let fileSeen = false;
    let work: Promise<T> | undefined;
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true;
        request.unpipe(parser);
        request.resume();
        reject(error);
      }
    };

    parser.on('file', (name, stream) => {
      if (name !== options.field || fileSeen) {
        stream.resume();
        fail(invalidUpload('unexpected_field'));
        return;
      }
      fileSeen = true;
      stream.on('limit', () => {
        stream.destroy(new AppError('FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE));
      });
      work = consume(stream);
      work.then((result) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      }, fail);
    });
    parser.on('field', () => fail(invalidUpload('unexpected_field')));
    parser.on('filesLimit', () => fail(invalidUpload('too_many_files')));
    parser.on('fieldsLimit', () => fail(invalidUpload('unexpected_field')));
    parser.on('error', () => fail(invalidUpload('malformed')));
    parser.on('close', () => {
      if (!fileSeen) {
        fail(invalidUpload('missing_file'));
      }
    });

    request.pipe(parser);
  });
}
