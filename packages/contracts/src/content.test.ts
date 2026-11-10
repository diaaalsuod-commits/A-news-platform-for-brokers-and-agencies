import { describe, expect, it } from 'vitest';
import {
  contactLanguagesSchema,
  createAreaRequestSchema,
  createDeveloperRequestSchema,
  createSalesContactRequestSchema,
  salesContactListQuerySchema,
  updateAreaRequestSchema,
  updateDeveloperRequestSchema,
  updateSalesContactRequestSchema,
} from './content.js';

const DEVELOPER_ID = '0b0f6f0e-3c58-4a8e-9d2b-0c7a6f3f1a11';

describe('developer requests', () => {
  const valid = { nameAr: 'لوميرا العقارية', nameEn: 'Lumera Estates' };

  it('FR-DAT-01 Arabic and English names are both required', () => {
    expect(createDeveloperRequestSchema.safeParse(valid).success).toBe(true);
    expect(createDeveloperRequestSchema.safeParse({ nameEn: 'Lumera' }).success).toBe(false);
    expect(createDeveloperRequestSchema.safeParse({ ...valid, nameAr: '  ' }).success).toBe(false);
  });

  it('FR-DAT-01 the website is https only; an empty optional field is cleared', () => {
    expect(
      createDeveloperRequestSchema.parse({ ...valid, website: ' https://lumera.example ' }).website,
    ).toBe('https://lumera.example');
    expect(
      createDeveloperRequestSchema.safeParse({ ...valid, website: 'http://lumera.example' })
        .success,
    ).toBe(false);
    expect(
      createDeveloperRequestSchema.parse({ ...valid, website: '', descriptionEn: '' }),
    ).toMatchObject({ website: null, descriptionEn: null });
  });

  it('FR-DAT-01 an update changes only what is sent, and may archive or restore', () => {
    expect(updateDeveloperRequestSchema.parse({ status: 'archived' })).toEqual({
      status: 'archived',
    });
    expect(updateDeveloperRequestSchema.parse({})).toEqual({});
    expect(updateDeveloperRequestSchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('NFR-09 a field the client may not set is refused', () => {
    for (const extra of [{ status: 'archived' }, { logoPath: 'x.png' }, { id: DEVELOPER_ID }]) {
      expect(createDeveloperRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    expect(updateDeveloperRequestSchema.safeParse({ logoPath: 'x.png' }).success).toBe(false);
  });
});

describe('sales contact requests', () => {
  const valid = { developerId: DEVELOPER_ID, fullName: 'Sara Haddad', phone: '+971501234567' };

  it('FR-DAT-02 a contact needs a developer, a name and an E.164 phone', () => {
    expect(createSalesContactRequestSchema.safeParse(valid).success).toBe(true);
    for (const change of [
      { phone: '050 123 4567' },
      { fullName: '' },
      { developerId: 'x' },
      { whatsapp: '0501234567' },
      { email: 'not-an-email' },
    ]) {
      expect(
        createSalesContactRequestSchema.safeParse({ ...valid, ...change }).success,
        JSON.stringify(change),
      ).toBe(false);
    }
  });

  it('FR-DAT-02 the email is normalised, and an empty optional field is cleared', () => {
    const parsed = createSalesContactRequestSchema.parse({
      ...valid,
      email: '  Sara@Developer.Example ',
      whatsapp: '',
      title: '',
    });
    expect(parsed).toMatchObject({ email: 'sara@developer.example', whatsapp: null, title: null });
    expect(updateSalesContactRequestSchema.parse({ email: null })).toEqual({ email: null });
  });

  it('FR-DAT-02 languages are lower-case two-letter codes, at most 10, each once', () => {
    expect(contactLanguagesSchema.parse(['ar', ' EN ', 'ru'])).toEqual(['ar', 'en', 'ru']);
    for (const languages of [['arabic'], ['a'], ['ar', 'AR'], Array(11).fill('ar'), ['a1']]) {
      expect(contactLanguagesSchema.safeParse(languages).success, String(languages)).toBe(false);
    }
  });

  it('FR-DAT-02 assigned projects are ids, each once', () => {
    expect(
      createSalesContactRequestSchema.safeParse({ ...valid, projectIds: [DEVELOPER_ID] }).success,
    ).toBe(true);
    for (const projectIds of [['x'], [DEVELOPER_ID, DEVELOPER_ID]]) {
      expect(createSalesContactRequestSchema.safeParse({ ...valid, projectIds }).success).toBe(
        false,
      );
    }
  });

  it('FR-CNT-01 the list cannot be searched or filtered by phone, WhatsApp or email', () => {
    const parsed = salesContactListQuerySchema.parse({
      q: 'Sara',
      phone: '+971501234567',
      email: 'sara@developer.example',
    });
    expect(Object.keys(parsed).sort()).toEqual(['page', 'pageSize', 'q']);
  });
});

describe('area requests', () => {
  const emirate = {
    level: 'emirate',
    nameAr: 'دبي',
    nameEn: 'Dubai',
    center: { lng: 55.27, lat: 25.2 },
  };

  it('FR-DAT-03 an area has both names and a center point', () => {
    expect(createAreaRequestSchema.safeParse(emirate).success).toBe(true);
    for (const change of [
      { nameAr: '' },
      { center: undefined },
      { center: { lng: '55.27', lat: 25.2 } },
      { center: { lng: 55.27 } },
      { center: { lng: Number.NaN, lat: 25.2 } },
      { level: 'city' },
    ]) {
      expect(
        createAreaRequestSchema.safeParse({ ...emirate, ...change }).success,
        JSON.stringify(change),
      ).toBe(false);
    }
  });

  it('FR-LOC-04 the country is never accepted from the client', () => {
    expect(createAreaRequestSchema.safeParse({ ...emirate, countryCode: 'AE' }).success).toBe(
      false,
    );
    expect(createAreaRequestSchema.safeParse({ ...emirate, country_code: 'SA' }).success).toBe(
      false,
    );
    expect(updateAreaRequestSchema.safeParse({ countryCode: 'SA' }).success).toBe(false);
  });

  it('FR-DAT-03 the level cannot be sent in an update', () => {
    expect(updateAreaRequestSchema.safeParse({ level: 'community' }).success).toBe(false);
    expect(updateAreaRequestSchema.parse({ nameEn: 'Dubai' })).toEqual({ nameEn: 'Dubai' });
  });
});
