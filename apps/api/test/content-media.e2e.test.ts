import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { MEDIA_MAX_BYTES, mediaSchema } from '@reih/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uaeDate } from '../src/shared/localization/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

const BOUNDARY = 'reih-media-boundary';

// Small files with real signatures, one per accepted type (FR-DAT-06).
/** A real 1 x 1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0'),
  Buffer.alloc(40),
  Buffer.from([0xff, 0xd9]),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([26, 0, 0, 0]),
  Buffer.from('WEBPVP8L'),
  Buffer.alloc(18, 1),
]);
/** A one-page PDF with no content. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);
/** An ISO base media file: an ftyp box with the isom brand and an empty mdat box. */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.from([0, 0, 2, 0]),
  Buffer.from('isommp41'),
  Buffer.from([0, 0, 0, 8]),
  Buffer.from('mdat'),
]);

type Fields = Record<string, string>;
/** The parts of a response body these tests read; any of them may be absent. */
interface AnswerBody {
  [key: string]: unknown;
  id: string;
  fileUrl: string;
  error: { code: string; details: unknown };
}
type Answer = { status: number; body: AnswerBody };

/** A multipart form: the fields, then the file (head, then zero bytes up to size), as a stream. */
function formStream(fields: Fields, file?: { head: Buffer; size?: number; filename?: string }) {
  async function* parts() {
    for (const [name, value] of Object.entries(fields)) {
      yield Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      );
    }
    if (file) {
      yield Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename ?? 'upload.bin'}"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n',
      );
      yield file.head;
      let left = (file.size ?? file.head.length) - file.head.length;
      const chunk = Buffer.alloc(256 * 1024);
      while (left > 0) {
        const size = Math.min(left, chunk.length);
        yield size === chunk.length ? chunk : chunk.subarray(0, size);
        left -= size;
      }
      yield Buffer.from('\r\n');
    }
    yield Buffer.from(`--${BOUNDARY}--\r\n`);
  }
  return Readable.from(parts());
}

describe('Media (FR-DAT-06, BR-14)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let communityId: string;
  let port: number;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    communityId = await fixtures.community(await fixtures.emirate());
    // Uploads stream through a real socket, so a 200 MB body is never built in memory here.
    const server = h.server();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    const server = h.server();
    server.closeAllConnections?.();
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  async function project(
    options: { stage?: 'ready' | 'under_construction'; status?: 'publish' | 'archive' } = {},
  ): Promise<string> {
    const created = await h.post('/content/projects', {
      session,
      body: {
        nameAr: 'دار الوسائط',
        nameEn: 'Media House',
        developerId: await fixtures.developer(),
        communityId,
        location: { lng: 55.14, lat: 25.08 },
        stage: options.stage ?? 'ready',
        ownershipType: 'freehold',
      },
    });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }
  async function publishWithImage(id: string): Promise<string> {
    const image = await upload(id, fieldsFor('image'), { head: PNG });
    expect(image.status).toBe(201);
    await h.post(`/content/projects/${id}/verify`, {
      session,
      body: { date: uaeDate(new Date()), source: 'Sales office' },
    });
    expect((await h.post(`/content/projects/${id}/publish`, { session })).status).toBe(200);
    return image.body.id as string;
  }

  const fieldsFor = (type: string, extra: Fields = {}): Fields => ({
    type,
    title: `A ${type}`,
    sourceNote: 'Own photography',
    licenseNote: 'Owned by the REIH team',
    ...extra,
  });

  /**
   * POST /content/projects/:id/media as a stream. abortAfter drops the connection after that many
   * bytes of the body have been written.
   */
  async function upload(
    projectId: string,
    fields: Fields,
    file?: { head: Buffer; size?: number; filename?: string },
    abortAfter?: number,
  ): Promise<Answer> {
    const { cookie, token } = await h.csrf();
    return new Promise<Answer>((resolve, reject) => {
      const request = httpRequest({
        host: '127.0.0.1',
        port,
        method: 'POST',
        path: h.path(`/content/projects/${projectId}/media`),
        headers: {
          'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
          cookie: `${cookie}; ${session}`,
          'x-csrf-token': token,
          'x-forwarded-for': '198.51.100.7',
        },
      });
      request.on('response', (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: response.statusCode ?? 0,
            body: text ? JSON.parse(text) : ({} as AnswerBody),
          });
        });
      });
      request.on('error', (error) =>
        abortAfter ? resolve({ status: 0, body: {} as AnswerBody }) : reject(error),
      );
      const body = formStream(fields, file);
      if (abortAfter === undefined) {
        body.pipe(request);
        return;
      }
      let sent = 0;
      body.on('data', (chunk: Buffer) => {
        sent += chunk.length;
        if (!request.write(chunk)) body.pause();
        if (sent >= abortAfter) {
          body.destroy();
          // Let the bytes reach the server and the disk before the connection drops.
          setTimeout(() => request.destroy(), 200);
        }
      });
      request.on('drain', () => body.resume());
    });
  }

  const patch = (projectId: string, mediaId: string, body: object) =>
    h.send('patch', `/content/projects/${projectId}/media/${mediaId}`, { session, body });
  const remove = (projectId: string, mediaId: string) =>
    h.send('delete', `/content/projects/${projectId}/media/${mediaId}`, { session });

  /** Every file under FILES_DIR, including the temporary folder, as key-like paths. */
  function storedFiles(): string[] {
    const walk = (path: string): string[] =>
      existsSync(path)
        ? readdirSync(path).flatMap((name) => {
            const child = join(path, name);
            return statSync(child).isDirectory() ? walk(child) : [child];
          })
        : [];
    return walk(h.filesDir).map((path) => relative(h.filesDir, path).split(sep).join('/'));
  }
  const mediaRows = async (projectId: string) =>
    (await h.db.query('SELECT id FROM media_files WHERE project_id = $1', [projectId])).rowCount;

  /** Waits until the temporary folder is empty, for at most two seconds. */
  async function settledDisk(): Promise<string[]> {
    for (let i = 0; i < 40 && storedFiles().some((key) => key.startsWith('.tmp/')); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return storedFiles();
  }

  // ---------------------------------------------------------------- accepted files

  it.each([
    ['image', 'JPEG', JPEG, 'image/jpeg', 'jpg'],
    ['image', 'PNG', PNG, 'image/png', 'png'],
    ['image', 'WebP', WEBP, 'image/webp', 'webp'],
    ['floor_plan', 'PDF', PDF, 'application/pdf', 'pdf'],
    ['brochure', 'PDF', PDF, 'application/pdf', 'pdf'],
    ['master_plan', 'PDF', PDF, 'application/pdf', 'pdf'],
    ['video', 'MP4', MP4, 'video/mp4', 'mp4'],
  ] as const)(
    'FR-DAT-06 stores a %s as %s with its title, type, order, source and license',
    async (type, _kind, content, mimeType, extension) => {
      const id = await project();
      const response = await upload(id, fieldsFor(type, { displayOrder: '3' }), { head: content });

      expect(response.status).toBe(201);
      expect(mediaSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        projectId: id,
        type,
        title: `A ${type}`,
        displayOrder: 3,
        mimeType,
        sizeBytes: content.length,
        sourceNote: 'Own photography',
        licenseNote: 'Owned by the REIH team',
      });
      const row = await h.db.query('SELECT file_path, uploaded_by FROM media_files WHERE id = $1', [
        response.body.id,
      ]);
      expect(row.rows[0].uploaded_by).toBe(operator.id);
      expect(row.rows[0].file_path).toMatch(
        new RegExp(`^project-media/[0-9a-f-]{36}\\.${extension}$`),
      );
      expect(readFileSync(join(h.filesDir, row.rows[0].file_path)).equals(content)).toBe(true);

      const file = await h.get(response.body.fileUrl.replace('/api/v1', ''), session);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain(mimeType);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['cache-control']).toBe('private');
    },
  );

  it('FR-DAT-06 NFR-08 a file that is not of the type its media type allows is refused, and nothing stays', async () => {
    const id = await project();
    const before = storedFiles();
    for (const [type, head] of [
      ['image', PDF],
      ['brochure', PNG],
      ['video', PNG],
      ['image', Buffer.from('MZ this is an executable')],
    ] as const) {
      const response = await upload(id, fieldsFor(type), { head, filename: 'looks-fine.png' });
      expect(response.status, type).toBe(415);
      expect(response.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    }
    expect(await settledDisk()).toEqual(before);
    expect(await mediaRows(id)).toBe(0);
  });

  it('NFR-08 the client file name is never used as a path', async () => {
    const id = await project();
    const response = await upload(id, fieldsFor('image'), {
      head: PNG,
      filename: '../../../outside.png',
    });
    expect(response.status).toBe(201);
    const row = await h.db.query('SELECT file_path FROM media_files WHERE id = $1', [
      response.body.id,
    ]);
    expect(row.rows[0].file_path).toMatch(/^project-media\/[0-9a-f-]{36}\.png$/);
    expect(storedFiles().every((key) => !key.includes('outside'))).toBe(true);
  });

  // ---------------------------------------------------------------- refusals leave nothing behind

  it('FR-DAT-06 BR-14 a file without a source or a license note is refused, and nothing stays on disk', async () => {
    const id = await project();
    const before = storedFiles();
    for (const fields of [
      fieldsFor('image', { sourceNote: '' }),
      fieldsFor('image', { licenseNote: '   ' }),
      (({ licenseNote: _l, ...rest }) => rest)(fieldsFor('image')),
      (({ sourceNote: _s, ...rest }) => rest)(fieldsFor('image')),
    ]) {
      const response = await upload(id, fields, { head: PNG, size: 2 * 1024 * 1024 });
      expect(response.status, JSON.stringify(fields)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(await settledDisk()).toEqual(before);
    expect(await mediaRows(id)).toBe(0);
  });

  it('FR-DAT-06 the text fields must come before the file part (P4.4 sends them first)', async () => {
    const id = await project();
    const before = storedFiles();
    const { cookie, token } = await h.csrf();
    // superagent writes the parts in call order: here the file comes first.
    const response = await request(h.server())
      .post(h.path(`/content/projects/${id}/media`))
      .set('Cookie', `${cookie}; ${session}`)
      .set('X-CSRF-Token', token)
      .attach('file', PNG, 'a.png')
      .field(fieldsFor('image'));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(await settledDisk()).toEqual(before);
    expect(await mediaRows(id)).toBe(0);
  });

  it('FR-DAT-06 an unknown or archived project is refused before anything is stored', async () => {
    const before = storedFiles();
    const unknown = await upload('00000000-0000-4000-8000-000000000000', fieldsFor('image'), {
      head: PNG,
      size: 1024 * 1024,
    });
    expect(unknown.status).toBe(404);

    const id = await project();
    expect((await h.post(`/content/projects/${id}/archive`, { session })).status).toBe(200);
    const archived = await upload(id, fieldsFor('image'), { head: PNG, size: 1024 * 1024 });
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe('PROJECT_ARCHIVED');
    expect(await settledDisk()).toEqual(before);
  });

  it('NFR-08 an upload aborted by the client leaves no file and no row', async () => {
    const id = await project();
    const before = storedFiles();
    await upload(id, fieldsFor('video'), { head: MP4, size: 20 * 1024 * 1024 }, 4 * 1024 * 1024);
    expect(await settledDisk()).toEqual(before);
    expect(await mediaRows(id)).toBe(0);
  });

  it.each([
    ['image', PNG],
    ['brochure', PDF],
  ] as const)(
    'FR-DAT-06 a %s over its limit is stopped while it streams, and nothing stays',
    async (type, head) => {
      const id = await project();
      const before = storedFiles();
      const started = Date.now();
      const response = await upload(id, fieldsFor(type), { head, size: MEDIA_MAX_BYTES[type] + 1 });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('FILE_TOO_LARGE');
      expect(await settledDisk()).toEqual(before);
      expect(await mediaRows(id)).toBe(0);
      console.info(
        `[timing] ${type} ${MEDIA_MAX_BYTES[type] + 1} bytes refused in ${Date.now() - started} ms`,
      );
    },
  );

  it('FR-DAT-06 E a 200 MB + 1 video is refused while it streams, never held in memory, and nothing stays', async () => {
    const id = await project();
    const before = storedFiles();
    const baseline = process.memoryUsage();
    let peak = 0;
    const sampler = setInterval(() => {
      const now = process.memoryUsage();
      peak = Math.max(
        peak,
        now.heapUsed + now.arrayBuffers - (baseline.heapUsed + baseline.arrayBuffers),
      );
    }, 20);
    const started = Date.now();
    const response = await upload(id, fieldsFor('video'), {
      head: MP4,
      size: MEDIA_MAX_BYTES.video + 1,
    });
    clearInterval(sampler);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    expect(await settledDisk()).toEqual(before);
    expect(await mediaRows(id)).toBe(0);
    console.info(
      `[timing] video ${MEDIA_MAX_BYTES.video + 1} bytes refused in ${Date.now() - started} ms; ` +
        `peak heap + buffers growth ${(peak / 1024 / 1024).toFixed(1)} MB`,
    );
    // The test process holds both ends of the upload; the file is 200 MB.
    expect(peak).toBeLessThan(64 * 1024 * 1024);
  });

  // ---------------------------------------------------------------- list, edit, delete

  it('FR-DAT-06 lists media by display order', async () => {
    const id = await project();
    const second = await upload(id, fieldsFor('image', { title: 'Second', displayOrder: '2' }), {
      head: PNG,
    });
    const first = await upload(id, fieldsFor('brochure', { title: 'First', displayOrder: '1' }), {
      head: PDF,
    });
    const list = await h.get(`/content/projects/${id}/media`, session);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([
      first.body.id,
      second.body.id,
    ]);
    const images = await h.get(`/content/projects/${id}/media?type=image`, session);
    expect(images.body.items.map((item: { id: string }) => item.id)).toEqual([second.body.id]);
    expect(
      (await h.get('/content/projects/00000000-0000-4000-8000-000000000000/media', session)).status,
    ).toBe(404);
  });

  it('FR-DAT-06 BR-14 edits title, order and notes; a blank source or license, or a new type, is refused', async () => {
    const id = await project();
    const media = await upload(id, fieldsFor('image'), { head: PNG });
    const changed = await patch(id, media.body.id, {
      title: 'Lobby at dusk',
      displayOrder: 7,
      licenseNote: 'CC BY 4.0, by A. Photographer',
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      title: 'Lobby at dusk',
      displayOrder: 7,
      licenseNote: 'CC BY 4.0, by A. Photographer',
    });
    for (const body of [
      { sourceNote: '' },
      { licenseNote: '  ' },
      { type: 'video' },
      { displayOrder: -1 },
    ]) {
      expect((await patch(id, media.body.id, body)).status, JSON.stringify(body)).toBe(400);
    }
    const other = await project();
    expect((await patch(other, media.body.id, { title: 'x' })).status).toBe(404);
  });

  it('FR-DAT-06 deleting a media item deletes the row only; its file stays on disk', async () => {
    const id = await project();
    const media = await upload(id, fieldsFor('brochure'), { head: PDF });
    const key = (
      await h.db.query('SELECT file_path FROM media_files WHERE id = $1', [media.body.id])
    ).rows[0].file_path;

    const response = await remove(id, media.body.id);
    expect(response.status).toBe(204);
    expect(await mediaRows(id)).toBe(0);
    expect(existsSync(join(h.filesDir, key))).toBe(true);
    expect((await remove(id, media.body.id)).status).toBe(404);
  });

  it('Q1 a published project keeps a licensed image: deleting its last one is refused with 422', async () => {
    const id = await project();
    const only = await publishWithImage(id);

    const refused = await remove(id, only);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatchObject({
      code: 'PUBLISH_BLOCKED',
      details: { blockers: ['licensed_image_missing'] },
    });

    const brochure = await upload(id, fieldsFor('brochure'), { head: PDF });
    expect((await remove(id, brochure.body.id)).status).toBe(204);
    const another = await upload(id, fieldsFor('image'), { head: PNG });
    expect((await remove(id, only)).status).toBe(204);
    expect((await remove(id, another.body.id)).status).toBe(422);
  });

  it('Q1 a draft may lose its last image', async () => {
    const id = await project();
    const media = await upload(id, fieldsFor('image'), { head: PNG });
    expect((await remove(id, media.body.id)).status).toBe(204);
  });

  it("Q4 an archived project's media cannot be edited or deleted, but can be read", async () => {
    const id = await project();
    const media = await upload(id, fieldsFor('image'), { head: PNG });
    expect((await h.post(`/content/projects/${id}/archive`, { session })).status).toBe(200);

    for (const response of [
      await patch(id, media.body.id, { title: 'x' }),
      await remove(id, media.body.id),
    ]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PROJECT_ARCHIVED');
    }
    expect((await h.get(`/content/projects/${id}/media`, session)).body.total).toBe(1);
    expect(
      (await h.get(`/content/projects/${id}/media/${media.body.id}/file`, session)).status,
    ).toBe(200);
  });
});
