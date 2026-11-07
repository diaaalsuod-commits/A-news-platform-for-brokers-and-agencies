import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { type Readable, Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/index.js';
import { AppError } from '../http/app-error.js';
import { detectBinaryKind, type FileKind, fileKinds, HEAD_BYTES } from './file-types.js';
import { isSvgDocument, sanitizeSvg } from './svg.js';

export interface SaveFileOptions {
  /** Folder under FILES_DIR, for example "logos". */
  directory: string;
  /** The largest size the caller accepts, in bytes. */
  maxBytes: number;
  /** The types the caller accepts. The real type decides, never the file's name. */
  allowed: readonly FileKind[];
}

export interface StoredFile {
  /** The path under FILES_DIR. Store this, and pass it to sign() and openRead(). */
  key: string;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
}

const DIRECTORY = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const TEMP_DIRECTORY = '.tmp';

const typeNotAllowed = () =>
  new AppError('FILE_TYPE_NOT_ALLOWED', HttpStatus.UNSUPPORTED_MEDIA_TYPE);

/** Stops the upload as soon as it is too large or its first bytes show a refused type. */
class UploadGuard extends Transform {
  bytes = 0;
  kind: FileKind | null = null;
  private head = Buffer.alloc(0);
  private checked = false;

  constructor(private readonly options: SaveFileOptions) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.options.maxBytes) {
      done(new AppError('FILE_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE));
      return;
    }
    if (!this.checked) {
      this.head = Buffer.concat([this.head, chunk]);
      if (this.head.length >= HEAD_BYTES) {
        const error = this.checkHead();
        if (error) {
          done(error);
          return;
        }
      }
    }
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    done(this.checked ? null : this.checkHead());
  }

  private checkHead(): AppError | null {
    this.checked = true;
    const kind = detectBinaryKind(this.head);
    if (kind && this.options.allowed.includes(kind)) {
      this.kind = kind;
      return null;
    }
    // Text has no magic bytes, so an SVG can only be judged once the whole file has arrived.
    return !kind && this.options.allowed.includes('svg') ? null : typeNotAllowed();
  }
}

@Injectable()
export class FileStorage {
  private readonly root: string;

  constructor(@Inject(ENV) env: Env) {
    this.root = resolve(env.FILES_DIR);
  }

  /** Streams the file to disk, so a large upload never sits in memory. Nothing stays if it fails. */
  async save(source: Readable, options: SaveFileOptions): Promise<StoredFile> {
    if (!DIRECTORY.test(options.directory)) {
      throw new RangeError(`Invalid storage directory: ${options.directory}`);
    }
    const tempPath = join(this.root, TEMP_DIRECTORY, randomUUID());
    await mkdir(dirname(tempPath), { recursive: true });

    try {
      const guard = new UploadGuard(options);
      await pipeline(source, guard, createWriteStream(tempPath));

      const svg = guard.kind ? null : await this.readSanitizedSvg(tempPath);
      const kind: FileKind = guard.kind ?? 'svg';
      const { extension, mimeType } = fileKinds[kind];
      const key = `${options.directory}/${randomUUID()}.${extension}`;
      const finalPath = this.pathOf(key);
      await mkdir(dirname(finalPath), { recursive: true });

      if (svg === null) {
        await rename(tempPath, finalPath);
        return { key, kind, mimeType, sizeBytes: guard.bytes };
      }
      await writeFile(finalPath, svg, 'utf8');
      return { key, kind, mimeType, sizeBytes: Buffer.byteLength(svg, 'utf8') };
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  openRead(key: string): ReadStream {
    return createReadStream(this.pathOf(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private async readSanitizedSvg(path: string): Promise<string> {
    const text = await readFile(path, 'utf8');
    const clean = isSvgDocument(text) ? sanitizeSvg(text) : null;
    if (clean === null) {
      throw typeNotAllowed();
    }
    return clean;
  }

  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) {
      throw new RangeError('The file key points outside the storage folder');
    }
    return path;
  }
}
