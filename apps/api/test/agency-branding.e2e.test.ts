import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AGENCY_LOGO_MAX_BYTES } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AgencyService } from '../src/modules/agency/index.js';
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

const BRANDING = {
  marketingName: 'Sandcastle Realty',
  primaryColor: '#0e4d64',
  secondaryColor: '#E0A458',
  phone: '+971501112233',
  email: '  Sales@Sandcastle.Example ',
  website: 'https://sandcastle.example',
  address: 'Office 5, Example Tower, Dubai',
  orn: '12345',
};

describe('Agency branding (FR-AGY-01)', () => {
  const h = useIdentityApp();
  let agencyId: string;
  let adminSession: string;
  let brokerSession: string;
  let admin: { email: string };
  let broker: { email: string };

  beforeAll(async () => {
    agencyId = await h.createAgency('active');
    admin = await h.createUser({ role: 'agency_admin', agencyId });
    broker = await h.createUser({ role: 'broker', agencyId });
  });

  beforeEach(async () => {
    adminSession = await h.sessionFor(admin.email);
    brokerSession = await h.sessionFor(broker.email);
  });

  const upload = (content: Buffer, filename: string, session = adminSession) =>
    h.send('put', '/agency/branding/logo', {
      session,
      attach: { field: 'logo', content, filename },
    });
  const logoFiles = () =>
    existsSync(join(h.filesDir, 'agency-logos'))
      ? readdirSync(join(h.filesDir, 'agency-logos')).sort()
      : [];

  it('FR-AGY-01 shows the defaults until the Agency Admin saves branding', async () => {
    const fresh = await h.createAgency('active');
    const freshAdmin = await h.createUser({ role: 'agency_admin', agencyId: fresh });
    const response = await h.get('/agency/branding', await h.sessionFor(freshAdmin.email));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      marketingName: `Agency ${fresh.slice(0, 8)}`,
      primaryColor: '#1F3A5F',
      secondaryColor: '#C9A227',
      logoUrl: null,
      isDefault: true,
    });
  });

  it('FR-AGY-01 saves every field; colors upper-case and the email normalised', async () => {
    const response = await h.send('put', '/agency/branding', {
      session: adminSession,
      body: BRANDING,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ...BRANDING,
      primaryColor: '#0E4D64',
      email: 'sales@sandcastle.example',
      isDefault: false,
    });
    const read = await h.get('/agency/branding', brokerSession);
    expect(read.body.marketingName).toBe('Sandcastle Realty');
  });

  it('FR-AGY-01 refuses bad colors, an http website, a bad ORN or phone, and a missing name', async () => {
    for (const change of [
      { primaryColor: '#FFF' },
      { secondaryColor: 'red' },
      { website: 'http://sandcastle.example' },
      { orn: 'ORN-1' },
      { orn: '12' },
      { phone: '050 111 2233' },
      { marketingName: ' ' },
      { logoPath: 'agency-logos/x.png' },
    ]) {
      const response = await h.send('put', '/agency/branding', {
        session: adminSession,
        body: { ...BRANDING, ...change },
      });
      expect(response.status, JSON.stringify(change)).toBe(400);
    }
  });

  it('FR-AGY-01 a broker reads the branding but cannot change it', async () => {
    expect((await h.get('/agency/branding', brokerSession)).status).toBe(200);
    const put = await h.send('put', '/agency/branding', { session: brokerSession, body: BRANDING });
    expect(put.status).toBe(403);
    expect((await upload(PNG, 'logo.png', brokerSession)).status).toBe(403);
  });

  describe('FR-AGY-01 logo', () => {
    it('FR-AGY-01 accepts a PNG and serves it behind the session with safe headers', async () => {
      const response = await upload(PNG, 'logo.png');
      expect(response.status).toBe(200);
      expect(response.body.logoUrl).toMatch(/^\/api\/v1\/agency\/branding\/logo\?v=/);

      const logo = await h.get('/agency/branding/logo', brokerSession).buffer(true);
      expect(logo.status).toBe(200);
      expect(logo.headers['content-type']).toBe('image/png');
      expect(logo.headers['x-content-type-options']).toBe('nosniff');
      expect(logo.headers['cache-control']).toBe('private');
      expect(Buffer.compare(logo.body as Buffer, PNG)).toBe(0);
      expect((await h.get('/agency/branding/logo')).status).toBe(401);
    });

    it('FR-AGY-01 NFR-08 sanitizes an SVG and serves it with the SVG CSP', async () => {
      const response = await upload(Buffer.from(HOSTILE_SVG), 'logo.svg');
      expect(response.status).toBe(200);

      const logo = await h.get('/agency/branding/logo', adminSession).buffer(true);
      expect(logo.headers['content-type']).toMatch(/^image\/svg\+xml/);
      expect(logo.headers['content-security-policy']).toContain("default-src 'none'");
      const text = Buffer.from(logo.body as Buffer).toString('utf8');
      expect(text).toContain('<rect');
      expect(text).not.toMatch(/<script|onload|<use|<image|evil\.example/i);
    });

    it('FR-AGY-01 refuses a JPEG, a disguised text file and a file over 2 MB', async () => {
      const jpeg = await upload(JPEG, 'logo.png');
      expect(jpeg.status).toBe(415);
      expect(jpeg.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');

      const text = await upload(Buffer.from('not an image at all'), 'logo.png');
      expect(text.status).toBe(415);

      const big = Buffer.concat([PNG, Buffer.alloc(AGENCY_LOGO_MAX_BYTES)]);
      const tooLarge = await upload(big, 'big.png');
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('FR-AGY-01 a new logo gets a new file and the old file stays for queued catalogs', async () => {
      await upload(PNG, 'first.png');
      const first = (await h.app.get(AgencyService).getBranding(agencyId))?.logoKey as string;
      await upload(Buffer.from(HOSTILE_SVG), 'second.svg');
      const second = (await h.app.get(AgencyService).getBranding(agencyId))?.logoKey as string;

      expect(second).not.toBe(first);
      expect(logoFiles()).toEqual(
        expect.arrayContaining([first.split('/')[1], second.split('/')[1]]),
      );
    });

    it('FR-AGY-01 removing the logo changes only the row; the file stays', async () => {
      await upload(PNG, 'logo.png');
      const key = (await h.app.get(AgencyService).getBranding(agencyId))?.logoKey as string;

      const response = await h.send('delete', '/agency/branding/logo', { session: adminSession });
      expect(response.status).toBe(200);
      expect(response.body.logoUrl).toBeNull();
      expect((await h.get('/agency/branding/logo', adminSession)).status).toBe(404);
      expect(logoFiles()).toContain(key.split('/')[1]);
    });

    it('FR-AGY-01 the first logo of an agency without branding creates it with the defaults', async () => {
      const fresh = await h.createAgency('active');
      const freshAdmin = await h.createUser({ role: 'agency_admin', agencyId: fresh });
      const session = await h.sessionFor(freshAdmin.email);
      const response = await upload(PNG, 'logo.png', session);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        marketingName: `Agency ${fresh.slice(0, 8)}`,
        primaryColor: '#1F3A5F',
      });
      expect(response.body.logoUrl).not.toBeNull();
    });
  });

  it('FR-AGY-01 a catalog generated after the change uses the new branding; an earlier copy does not change', async () => {
    const agencies = h.app.get(AgencyService);
    await h.send('put', '/agency/branding', { session: adminSession, body: BRANDING });
    await upload(PNG, 'before.png');
    // A catalog copies the branding when it is generated (FR-CAT-06).
    const earlier = structuredClone(await agencies.getBranding(agencyId));

    await h.send('put', '/agency/branding', {
      session: adminSession,
      body: { ...BRANDING, marketingName: 'Sandcastle Realty Rebranded', primaryColor: '#000000' },
    });
    await upload(Buffer.from(HOSTILE_SVG), 'after.svg');
    const later = await agencies.getBranding(agencyId);

    expect(earlier).toMatchObject({ marketingName: 'Sandcastle Realty', primaryColor: '#0E4D64' });
    expect(later).toMatchObject({
      marketingName: 'Sandcastle Realty Rebranded',
      primaryColor: '#000000',
    });
    expect(later?.logoKey).not.toBe(earlier?.logoKey);
    // The earlier copy's logo file is still there for the catalog that uses it.
    expect(logoFiles()).toContain((earlier?.logoKey as string).split('/')[1]);
    expect(later).toMatchObject({
      agencyId,
      nameAr: expect.any(String),
      nameEn: expect.any(String),
    });
  });
});
