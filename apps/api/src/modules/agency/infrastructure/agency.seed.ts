import { seedId, type SeedDb } from '../../../shared/database/seed-helpers.js';
import { agencies, agencyBranding } from './agency.schema.js';

/** D-02: fictional demo agencies, made up for REIH. No logos (FR-AGY-01 lets the admin add one). */
const DEMO_AGENCIES = [
  {
    slug: 'sandline',
    nameEn: 'Sandline Realty (Demo)',
    nameAr: 'ساندلاين العقارية (تجريبي)',
    tradeLicenseNo: 'DEMO-TL-0001',
    contactEmail: 'office@sandline.reih-demo.test',
    contactPhone: '+971500000101',
    branding: {
      marketingName: 'Sandline Realty',
      primaryColor: '#0E4D64',
      secondaryColor: '#E0A458',
      phone: '+971500000101',
      email: 'sales@sandline.reih-demo.test',
      website: 'https://sandline.reih-demo.test',
      address: 'Office 101, Demo Tower, Dubai (fictional)',
      orn: '10001',
    },
  },
  {
    slug: 'corniche-key',
    nameEn: 'Corniche Key Homes (Demo)',
    nameAr: 'كورنيش كي للمنازل (تجريبي)',
    tradeLicenseNo: 'DEMO-TL-0002',
    contactEmail: 'office@corniche-key.reih-demo.test',
    contactPhone: '+971500000202',
    branding: {
      marketingName: 'Corniche Key Homes',
      primaryColor: '#2E294E',
      secondaryColor: '#1B998B',
      phone: '+971500000202',
      email: 'hello@corniche-key.reih-demo.test',
      website: 'https://corniche-key.reih-demo.test',
      address: 'Unit 7, Example Street, Abu Dhabi (fictional)',
      orn: '20002',
    },
  },
] as const;

export interface DemoAgency {
  id: string;
  slug: string;
  name: string;
}

/**
 * db:seed:demo: two fictional agencies with branding and no logo. Deterministic ids and ON CONFLICT
 * DO NOTHING, so a second run changes nothing and never overwrites an admin's later edit.
 */
export async function seedDemoAgencies(db: SeedDb, createdBy: string): Promise<DemoAgency[]> {
  const seeded = DEMO_AGENCIES.map((agency) => ({ ...agency, id: seedId('agency', agency.slug) }));
  await db.transaction(async (tx) => {
    await tx
      .insert(agencies)
      .values(
        seeded.map(({ id, nameEn, nameAr, tradeLicenseNo, contactEmail, contactPhone }) => ({
          id,
          nameEn,
          nameAr,
          tradeLicenseNo,
          contactEmail,
          contactPhone,
          createdBy,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(agencyBranding)
      .values(seeded.map(({ id, branding }) => ({ agencyId: id, ...branding })))
      .onConflictDoNothing();
  });
  return seeded.map(({ id, slug, nameEn }) => ({ id, slug, name: nameEn }));
}
