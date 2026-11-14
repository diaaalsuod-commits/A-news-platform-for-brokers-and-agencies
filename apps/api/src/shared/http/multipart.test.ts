import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Env } from '../config/index.js';
import { FileStorage } from '../files/file-storage.js';
import { readFileWithFields, readSingleFile } from './multipart.js';

const BOUNDARY = 'reih-test-boundary';
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG = Buffer.concat([PNG_HEAD, Buffer.alloc(64, 1)]);
const NOTES = z.object({ title: z.string().min(1), license: z.string().min(1) }).strict();

type Part = { field: string; value: string } | { file: string; filename: string; body: Buffer };

/** A multipart/form-data body with the parts in the order given. */
function form(parts: Part[]): Buffer {
  const chunks = parts.map((part) =>
    'value' in part
      ? Buffer.from(
          `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.field}"\r\n\r\n` +
            `${part.value}\r\n`,
        )
      : Buffer.concat([
          Buffer.from(
            `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.file}"; ` +
              `filename="${part.filename}"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          part.body,
          Buffer.from('\r\n'),
        ]),
  );
  return Buffer.concat([...chunks, Buffer.from(`--${BOUNDARY}--\r\n`)]);
}

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? filesUnder(child) : [child];
  });
}

/** Resolves with the outcome, or with 'pending' if the promise has not settled within ms. */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<string> {
  return Promise.race([
    promise.then(
      () => 'resolved',
      (error: unknown) => `rejected: ${(error as Error).message}`,
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

describe('multipart upload', () => {
  let root: string;
  let storage: FileStorage;
  let server: Server | undefined;
  let outcome: Promise<unknown>;
  let serverReceived: Promise<void>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reih-multipart-'));
    storage = new FileStorage({ FILES_DIR: root } as Env);
  });

  afterEach(async () => {
    await closeServer();
    rmSync(root, { recursive: true, force: true });
  });

  async function closeServer(): Promise<void> {
    const current = server;
    server = undefined;
    if (!current) return;
    const closed = new Promise<void>((resolve) => current.close(() => resolve()));
    current.closeAllConnections();
    await closed;
  }

  /** A server whose one route runs handle; outcome is that handler's promise. */
  async function listen(handle: (request: IncomingMessage) => Promise<unknown>): Promise<number> {
    await closeServer();
    let markReceived!: () => void;
    serverReceived = new Promise<void>((resolve) => (markReceived = resolve));
    const current = createServer((request, response) => {
      outcome = handle(request);
      outcome.then(
        () => response.end(),
        () => response.end(),
      );
      markReceived();
    });
    server = current;
    await new Promise<void>((resolve) => current.listen(0, '127.0.0.1', resolve));
    return (current.address() as AddressInfo).port;
  }

  /** Sends a whole form and waits for the server's outcome. */
  async function send(port: number, body: Buffer): Promise<string> {
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'PUT',
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        'content-length': body.length,
      },
    });
    client.on('error', () => undefined);
    client.on('response', (response) => response.resume());
    client.end(body);
    await serverReceived;
    return settleWithin(outcome, 3000);
  }

  /** Sends the form's head and some file bytes, then drops the connection mid-file. */
  async function abortMidFile(port: number, withFields: boolean): Promise<void> {
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'PUT',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    });
    client.on('error', () => undefined);
    if (withFields) {
      client.write(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="title"\r\n\r\nT\r\n` +
          `--${BOUNDARY}\r\nContent-Disposition: form-data; name="license"\r\n\r\nCC0\r\n`,
      );
    }
    client.write(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n` +
        'Content-Type: image/png\r\n\r\n',
    );
    client.write(Buffer.concat([PNG_HEAD, Buffer.alloc(64 * 1024, 1)]));
    await serverReceived;
    // Let the first bytes reach the disk, so a temporary file exists.
    await new Promise((resolve) => setTimeout(resolve, 200));
    client.destroy();
  }

  const saveSingle = (request: IncomingMessage) =>
    readSingleFile(request as Request, { field: 'file', maxBytes: 1024 * 1024 }, (file) =>
      storage.save(file, { directory: 'uploads', maxBytes: 1024 * 1024, allowed: ['png'] }),
    );

  const saveWithFields = (request: IncomingMessage) =>
    readFileWithFields(
      request as Request,
      { field: 'file', maxBytes: 1024 * 1024, fields: NOTES, maxFields: 5, maxFieldBytes: 100 },
      async (fields, file) => ({
        fields,
        stored: await storage.save(file, {
          directory: 'uploads',
          maxBytes: 1024 * 1024,
          allowed: ['png'],
        }),
      }),
    );

  const storedKeys = () =>
    filesUnder(root).map((path) => relative(root, path).split(sep).join('/'));

  it('NFR-08 a single-file upload aborted by the client fails and leaves nothing on disk', async () => {
    const port = await listen(saveSingle);

    await abortMidFile(port, false);

    expect(await settleWithin(outcome, 3000)).toMatch(/^rejected/);
    expect(filesUnder(root)).toEqual([]);
  });

  it('NFR-08 an upload with fields aborted by the client fails and leaves nothing on disk', async () => {
    const port = await listen(saveWithFields);

    await abortMidFile(port, true);

    expect(await settleWithin(outcome, 3000)).toMatch(/^rejected/);
    expect(filesUnder(root)).toEqual([]);
  });

  it('reads the text fields that come before the file', async () => {
    const port = await listen(saveWithFields);
    const body = form([
      { field: 'title', value: 'Lobby' },
      { field: 'license', value: 'Own photo' },
      { file: 'file', filename: 'lobby.png', body: PNG },
    ]);

    expect(await send(port, body)).toBe('resolved');
    const result = (await outcome) as { fields: unknown; stored: { key: string } };
    expect(result.fields).toEqual({ title: 'Lobby', license: 'Own photo' });
    expect(result.stored.key).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);
  });

  it('FR-DAT-06 refuses fields that fail the schema before storing any byte', async () => {
    const port = await listen(saveWithFields);
    const body = form([
      { field: 'title', value: 'Lobby' },
      { file: 'file', filename: 'lobby.png', body: PNG },
    ]);

    expect(await send(port, body)).toBe('rejected: VALIDATION_FAILED');
    await expect(outcome).rejects.toMatchObject({
      details: { issues: [{ path: 'license', code: 'invalid_type' }] },
    });
    expect(filesUnder(root)).toEqual([]);
  });

  it('refuses a field sent after the file', async () => {
    const port = await listen(saveWithFields);
    const body = form([
      { field: 'title', value: 'Lobby' },
      { file: 'file', filename: 'lobby.png', body: PNG },
      { field: 'license', value: 'Own photo' },
    ]);

    expect(await send(port, body)).toMatch(/^rejected/);
    await expect(outcome).rejects.toMatchObject({
      details: { issues: [{ path: 'license', code: 'after_file' }] },
    });
    // The file had fully arrived, but the form was refused, so it was not kept.
    expect(filesUnder(root)).toEqual([]);
  });

  it('refuses a repeated field', async () => {
    const port = await listen(saveWithFields);
    const body = form([
      { field: 'title', value: 'A' },
      { field: 'title', value: 'B' },
      { field: 'license', value: 'Own photo' },
      { file: 'file', filename: 'a.png', body: PNG },
    ]);

    expect(await send(port, body)).toMatch(/^rejected/);
    await expect(outcome).rejects.toMatchObject({
      details: { issues: [{ path: 'title', code: 'duplicate' }] },
    });
  });

  it('refuses a field longer than the limit', async () => {
    const port = await listen(saveWithFields);
    const body = form([
      { field: 'title', value: 'x'.repeat(101) },
      { field: 'license', value: 'Own photo' },
      { file: 'file', filename: 'a.png', body: PNG },
    ]);

    expect(await send(port, body)).toMatch(/^rejected/);
    await expect(outcome).rejects.toMatchObject({
      details: { issues: [{ path: 'title', code: 'too_long' }] },
    });
  });

  it('NFR-08 never uses the client file name as a path', async () => {
    const port = await listen(saveWithFields);
    const body = form([
      { field: 'title', value: 'Lobby' },
      { field: 'license', value: 'Own photo' },
      { file: 'file', filename: '../../outside.png', body: PNG },
    ]);

    expect(await send(port, body)).toBe('resolved');
    const keys = storedKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^uploads\/[0-9a-f-]{36}\.png$/);
  });

  it('a single-file upload still refuses any text field', async () => {
    const port = await listen(saveSingle);
    const body = form([
      { field: 'title', value: 'Lobby' },
      { file: 'file', filename: 'a.png', body: PNG },
    ]);

    expect(await send(port, body)).toBe('rejected: VALIDATION_FAILED');
    expect(filesUnder(root)).toEqual([]);
  });
});
