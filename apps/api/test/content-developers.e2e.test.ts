import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEVELOPER_LOGO_MAX_BYTES, developerSchema } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pickDescription, pickName } from '../src/shared/localization/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(120, 7),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const HOSTILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">
  <script>alert(1)</script>
  <rect width="10" height="10" fill="#1F3A5F" onload="alert(2)"/>
  <use xlink:href="https://evil.example/sprite.svg#a"/>
  <image href="https://evil.example/x.png"/>
</svg>`;

const DEVELOPER = {
  nameAr: 'لوميرا العقارية',
  nameEn: 'Lumera Estates',
  descriptionAr: 'شركة تطوير خيالية.',
  descriptionEn: 'A fictional developer.',
  website: 'https://lumera.example',
};

describe('Developers (FR-DAT-01)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const create = async (body: object = DEVELOPER) =>
    h.post('/content/developers', { session, body });
  const createId = async (body: object = DEVELOPER) => (await create(body)).body.id as string;
  const patch = (id: string, body: object) =>
    h.send('patch', `/content/developers/${id}`, { session, body });
  const upload = (id: string, content: Buffer, filename: string) =>
    h.send('put', `/content/developers/${id}/logo`, {
      session,
      attach: { field: 'logo', content, filename },
    });
  const logoFiles = () =>
    existsSync(join(h.filesDir, 'developer-logos'))
      ? readdirSync(join(h.filesDir, 'developer-logos')).sort()
      : [];
  const logoKey = async (id: string) =>
    (await h.db.query('SELECT logo_path FROM developers WHERE id = $1', [id])).rows[0].logo_path as
      string | null;

  // ---------------------------------------------------------------- create and edit

  it('FR-DAT-01 creates a developer with Arabic and English names, descriptions and a website', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ...DEVELOPER, status: 'active', logoUrl: null });
    expect(developerSchema.safeParse(response.body).success).toBe(true);

    const read = await h.get(`/content/developers/${response.body.id}`, session);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(response.body);
  });

  it('FR-DAT-01 both names are required; a bad website or an unknown field is refused with 400', async () => {
    for (const body of [
      { nameEn: 'Only English' },
      { nameAr: 'عربي فقط' },
      { ...DEVELOPER, nameAr: '   ' },
      { ...DEVELOPER, website: 'http://lumera.example' },
      { ...DEVELOPER, website: 'lumera.example' },
      { ...DEVELOPER, status: 'archived' },
      { ...DEVELOPER, logoPath: 'developer-logos/x.png' },
      { ...DEVELOPER, descriptionEn: 'x'.repeat(5001) },
    ]) {
      const response = await create(body);
      expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('FR-DAT-01 an edit changes only the fields sent; null or an empty text clears an optional one', async () => {
    const id = await createId();
    const renamed = await patch(id, { nameEn: 'Lumera Estates Group' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ ...DEVELOPER, nameEn: 'Lumera Estates Group' });

    const cleared = await patch(id, { descriptionAr: null, website: '' });
    expect(cleared.body).toMatchObject({
      descriptionAr: null,
      website: null,
      descriptionEn: DEVELOPER.descriptionEn,
    });
    expect((await patch(id, { logoPath: 'x.png' })).status).toBe(400);
    expect((await patch(randomUUID(), { nameEn: 'Nobody' })).status).toBe(404);
    expect((await h.get('/content/developers/not-a-uuid', session)).status).toBe(400);
  });

  it('FR-LOC-03 both languages are kept, and a missing description falls back to the other language', async () => {
    const id = await createId({ ...DEVELOPER, descriptionAr: null });
    const { body } = await h.get(`/content/developers/${id}`, session);
    expect(body).toMatchObject({ nameAr: DEVELOPER.nameAr, nameEn: DEVELOPER.nameEn });
    expect(pickName(body, 'ar')).toBe(DEVELOPER.nameAr);
    expect(pickDescription(body, 'ar')).toBe(DEVELOPER.descriptionEn);
    expect(pickDescription(body, 'en')).toBe(DEVELOPER.descriptionEn);
  });

  // ---------------------------------------------------------------- archive

  it('FR-DAT-01 archives a developer and restores it; an archived developer stays readable', async () => {
    const id = await createId();
    const archived = await patch(id, { status: 'archived' });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');
    expect((await h.get(`/content/developers/${id}`, session)).body.status).toBe('archived');

    const restored = await patch(id, { status: 'active' });
    expect(restored.body.status).toBe('active');
    expect((await patch(id, { status: 'deleted' })).status).toBe(400);
  });

  it('FR-DAT-01 the list is paged, filters by status and searches both names on the server', async () => {
    const mark = randomUUID().slice(0, 8);
    const first = await createId({ nameAr: `الواحة ${mark}`, nameEn: `Oasis ${mark} One` });
    const second = await createId({ nameAr: `الواحة ${mark}`, nameEn: `Oasis ${mark} Two` });
    await patch(second, { status: 'archived' });

    const byEnglish = await h.get(
      `/content/developers?q=${encodeURIComponent(`oasis ${mark}`)}`,
      session,
    );
    expect(byEnglish.status).toBe(200);
    expect(byEnglish.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(byEnglish.body.items.map((item: { id: string }) => item.id)).toEqual([first, second]);

    const byArabic = await h.get(
      `/content/developers?q=${encodeURIComponent(`الواحة ${mark}`)}`,
      session,
    );
    expect(byArabic.body.total).toBe(2);

    const archived = await h.get(`/content/developers?q=${mark}&status=archived`, session);
    expect(archived.body.items.map((item: { id: string }) => item.id)).toEqual([second]);

    const paged = await h.get(`/content/developers?q=${mark}&page=2&pageSize=1`, session);
    expect(paged.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(paged.body.items.map((item: { id: string }) => item.id)).toEqual([second]);

    expect((await h.get('/content/developers?pageSize=100', session)).status).toBe(200);
    expect((await h.get('/content/developers?pageSize=101', session)).status).toBe(400);
    expect((await h.get('/content/developers?status=deleted', session)).status).toBe(400);
  });

  // ---------------------------------------------------------------- delete

  it('FR-DAT-01 a developer with a project cannot be deleted: 409, and it is still there', async () => {
    const id = await createId();
    const communityId = await fixtures.community(await fixtures.emirate());
    await fixtures.project({ developerId: id, communityId, createdBy: operator.id });

    const response = await h.send('delete', `/content/developers/${id}`, { session });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DEVELOPER_IN_USE');
    expect((await h.get(`/content/developers/${id}`, session)).status).toBe(200);
    // Archiving is what remains for a developer in use.
    expect((await patch(id, { status: 'archived' })).status).toBe(200);
  });

  it('FR-DAT-01 a developer with a sales contact cannot be deleted: 409', async () => {
    const id = await createId();
    const contact = await h.post('/content/sales-contacts', {
      session,
      body: { developerId: id, fullName: 'Sara Haddad', phone: '+971501234567' },
    });
    expect(contact.status).toBe(201);

    const response = await h.send('delete', `/content/developers/${id}`, { session });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DEVELOPER_IN_USE');
  });

  it('FR-DAT-01 a developer that nothing uses is deleted; an unknown one is 404', async () => {
    const id = await createId();
    expect((await h.send('delete', `/content/developers/${id}`, { session })).status).toBe(204);
    expect((await h.get(`/content/developers/${id}`, session)).status).toBe(404);
    expect((await h.send('delete', `/content/developers/${id}`, { session })).status).toBe(404);
  });

  // ---------------------------------------------------------------- logo

  describe('FR-DAT-01 logo', () => {
    it('FR-DAT-01 accepts a PNG and serves it behind the session with safe headers', async () => {
      const id = await createId();
      const response = await upload(id, PNG, 'logo.png');
      expect(response.status).toBe(200);
      expect(response.body.logoUrl).toMatch(
        new RegExp(`^/api/v1/content/developers/${id}/logo\\?v=`),
      );

      const logo = await h.get(`/content/developers/${id}/logo`, session).buffer(true);
      expect(logo.status).toBe(200);
      expect(logo.headers['content-type']).toBe('image/png');
      expect(logo.headers['x-content-type-options']).toBe('nosniff');
      expect(logo.headers['cache-control']).toBe('private');
      expect(Buffer.compare(logo.body as Buffer, PNG)).toBe(0);
      expect((await h.get(`/content/developers/${id}/logo`)).status).toBe(401);
    });

    it('FR-DAT-01 NFR-08 sanitizes an SVG and serves it with the SVG CSP', async () => {
      const id = await createId();
      expect((await upload(id, Buffer.from(HOSTILE_SVG), 'logo.svg')).status).toBe(200);

      const logo = await h.get(`/content/developers/${id}/logo`, session).buffer(true);
      expect(logo.headers['content-type']).toMatch(/^image\/svg\+xml/);
      expect(logo.headers['content-security-policy']).toContain("default-src 'none'");
      const text = Buffer.from(logo.body as Buffer).toString('utf8');
      expect(text).toContain('<rect');
      expect(text).not.toMatch(/<script|onload|<use|<image|evil\.example/i);
    });

    it('FR-DAT-01 NFR-08 refuses a JPEG, a disguised text file and a file over 2 MB, and keeps none of them', async () => {
      const id = await createId();
      const before = logoFiles();

      const jpeg = await upload(id, JPEG, 'logo.png');
      expect(jpeg.status).toBe(415);
      expect(jpeg.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');

      expect((await upload(id, Buffer.from('not an image at all'), 'logo.png')).status).toBe(415);

      const big = Buffer.concat([PNG, Buffer.alloc(DEVELOPER_LOGO_MAX_BYTES)]);
      const tooLarge = await upload(id, big, 'big.png');
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body.error.code).toBe('FILE_TOO_LARGE');

      expect(await logoKey(id)).toBeNull();
      expect(logoFiles()).toEqual(before);
    });

    it('FR-DAT-01 a new logo gets a new file and the old file is not deleted', async () => {
      const id = await createId();
      await upload(id, PNG, 'first.png');
      const first = (await logoKey(id)) as string;
      const replaced = await upload(id, Buffer.from(HOSTILE_SVG), 'second.svg');
      const second = (await logoKey(id)) as string;

      expect(second).not.toBe(first);
      expect(first).toMatch(/^developer-logos\/[0-9a-f-]{36}\.png$/);
      expect(replaced.body.logoUrl).toContain(second.split('/')[1]?.split('.')[0]);
      expect(logoFiles()).toEqual(
        expect.arrayContaining([first.split('/')[1], second.split('/')[1]]),
      );
    });

    it('FR-DAT-01 removing the logo changes only the row; the file stays', async () => {
      const id = await createId();
      await upload(id, PNG, 'logo.png');
      const key = (await logoKey(id)) as string;

      const response = await h.send('delete', `/content/developers/${id}/logo`, { session });
      expect(response.status).toBe(200);
      expect(response.body.logoUrl).toBeNull();
      expect((await h.get(`/content/developers/${id}/logo`, session)).status).toBe(404);
      expect(logoFiles()).toContain(key.split('/')[1]);
    });

    it('FR-DAT-01 a logo for a developer that does not exist is 404 and leaves no file', async () => {
      const before = logoFiles();
      const response = await upload(randomUUID(), PNG, 'logo.png');
      expect(response.status).toBe(404);
      expect(logoFiles()).toEqual(before);
      expect(
        (await h.send('delete', `/content/developers/${randomUUID()}/logo`, { session })).status,
      ).toBe(404);
    });

    it('FR-DAT-01 the upload takes one file in the "logo" field and nothing else', async () => {
      const id = await createId();
      const wrongField = await h.send('put', `/content/developers/${id}/logo`, {
        session,
        attach: { field: 'file', content: PNG, filename: 'logo.png' },
      });
      expect(wrongField.status).toBe(400);
      const notMultipart = await h.send('put', `/content/developers/${id}/logo`, {
        session,
        body: { logo: 'x' },
      });
      expect(notMultipart.status).toBe(400);
    });
  });
});
