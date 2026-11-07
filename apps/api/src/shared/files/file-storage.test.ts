import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../config/index.js';
import { FileStorage, type SaveFileOptions } from './file-storage.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4, 1),
  Buffer.from('WEBP'),
  Buffer.alloc(64, 1),
]);
const PDF = Buffer.from('%PDF-1.7\nsome content of the document');
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 32]),
  Buffer.from('ftypisom'),
  Buffer.alloc(64, 1),
]);
const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 32]),
  Buffer.from('ftypheic'),
  Buffer.alloc(64, 1),
]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(254, 0x90)]);
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>';

const MB = 1024 * 1024;
const images: SaveFileOptions = {
  directory: 'media/images',
  maxBytes: 10 * MB,
  allowed: ['jpeg', 'png', 'webp'],
};
const logos: SaveFileOptions = { directory: 'logos', maxBytes: 2 * MB, allowed: ['png', 'svg'] };

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? filesUnder(child) : [child];
  });
}

describe('FileStorage', () => {
  let root: string;
  let storage: FileStorage;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reih-files-'));
    storage = new FileStorage({ FILES_DIR: root } as Env);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const upload = (content: Buffer | string, options: SaveFileOptions) =>
    storage.save(Readable.from([Buffer.from(content)]), options);

  it('NFR-08 refuses a renamed .exe uploaded as .png', async () => {
    // The storage is never told the file's name, so renaming the file changes nothing.
    await expect(upload(EXE, images)).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
      status: 415,
    });
    expect(filesUnder(root)).toEqual([]);
  });

  it('NFR-08 refuses a renamed .exe where SVG is allowed too', async () => {
    await expect(upload(EXE, logos)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    expect(filesUnder(root)).toEqual([]);
  });

  it('FR-DAT-06 refuses a real file of a type the caller did not allow', async () => {
    await expect(upload(PDF, images)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
  });

  it('refuses an image in an MP4 container', async () => {
    const options = { directory: 'videos', maxBytes: MB, allowed: ['mp4'] } as const;
    await expect(upload(HEIC, options)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
  });

  it.each([
    ['png', PNG, 'image/png'],
    ['jpg', JPEG, 'image/jpeg'],
    ['webp', WEBP, 'image/webp'],
    ['pdf', PDF, 'application/pdf'],
    ['mp4', MP4, 'video/mp4'],
  ] as const)('stores a real .%s under a generated name', async (extension, content, mimeType) => {
    const stored = await upload(content, {
      directory: 'media',
      maxBytes: MB,
      allowed: ['jpeg', 'png', 'webp', 'pdf', 'mp4'],
    });
    expect(stored.key).toMatch(new RegExp(`^media/[0-9a-f-]{36}\\.${extension}$`));
    expect(stored).toMatchObject({ mimeType, sizeBytes: content.length });
    expect(readFileSync(join(root, stored.key)).equals(content)).toBe(true);
  });

  it('reads the type correctly when the first bytes arrive in small chunks', async () => {
    const chunks = [PNG.subarray(0, 3), PNG.subarray(3, 5), PNG.subarray(5)];
    const stored = await storage.save(Readable.from(chunks), images);
    expect(stored.kind).toBe('png');
    expect(stored.sizeBytes).toBe(PNG.length);
  });

  it('refuses a file shorter than any signature', async () => {
    await expect(upload('hi', images)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
    expect(filesUnder(root)).toEqual([]);
  });

  it('NFR-08 refuses a file over the limit the caller passed and leaves nothing behind', async () => {
    await expect(upload(PNG, { ...images, maxBytes: PNG.length - 1 })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      status: 413,
    });
    expect(filesUnder(root)).toEqual([]);
  });

  it('accepts a file of exactly the limit', async () => {
    await expect(upload(PNG, { ...images, maxBytes: PNG.length })).resolves.toMatchObject({
      sizeBytes: PNG.length,
    });
  });

  it('stops reading a large upload as soon as it passes the limit', async () => {
    let chunksRead = 0;
    const source = Readable.from(
      (function* () {
        yield PNG;
        for (let index = 0; index < 1_000; index += 1) {
          chunksRead += 1;
          yield Buffer.alloc(MB);
        }
      })(),
    );
    await expect(storage.save(source, { ...images, maxBytes: 5 * MB })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
    expect(chunksRead).toBeLessThan(50);
    expect(filesUnder(root)).toEqual([]);
  });

  it('FR-AGY-01 recognises an SVG logo by parsing it, and stores it sanitized', async () => {
    const stored = await upload(SVG, logos);
    expect(stored).toMatchObject({ kind: 'svg', mimeType: 'image/svg+xml' });
    expect(stored.key).toMatch(/^logos\/[0-9a-f-]{36}\.svg$/);

    const saved = readFileSync(join(root, stored.key), 'utf8');
    expect(saved).not.toContain('onload');
    expect(saved).toContain('<path');
    expect(stored.sizeBytes).toBe(Buffer.byteLength(saved));
    expect(filesUnder(root)).toHaveLength(1);
  });

  it('FR-AGY-01 refuses text that is not an SVG', async () => {
    await expect(upload('<html><body>hello</body></html>', logos)).rejects.toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
    expect(filesUnder(root)).toEqual([]);
  });

  it('refuses an SVG where the caller did not allow SVG', async () => {
    await expect(upload(SVG, images)).rejects.toMatchObject({ code: 'FILE_TYPE_NOT_ALLOWED' });
  });

  it('refuses a folder or a key that leaves the storage folder', async () => {
    await expect(upload(PNG, { ...images, directory: '../outside' })).rejects.toThrow(RangeError);
    expect(() => storage.openRead('../outside.png')).toThrow(RangeError);
    await expect(storage.remove('../outside.png')).rejects.toThrow(RangeError);
  });

  it('reads back and removes a stored file', async () => {
    const stored = await upload(PNG, images);
    const chunks: Buffer[] = [];
    for await (const chunk of storage.openRead(stored.key)) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).equals(PNG)).toBe(true);

    await storage.remove(stored.key);
    expect(filesUnder(root)).toEqual([]);
  });
});
