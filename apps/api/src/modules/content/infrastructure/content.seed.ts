import { Readable } from 'node:stream';
import { crc32, deflateSync } from 'node:zlib';
import { eq, inArray } from 'drizzle-orm';
import {
  createSeedRandom,
  inBatches,
  type SeedDb,
  seedId,
  type SeedRandom,
} from '../../../shared/database/seed-helpers.js';
import type { FileStorage } from '../../../shared/files/index.js';
import {
  areas,
  developers,
  mediaFiles,
  paymentPlanMilestones,
  paymentPlans,
  projectAmenities,
  projects,
  projectSalesContacts,
  projectVerifications,
  salesContacts,
  units,
  unitTagLinks,
} from './content.schema.js';

export interface ContentSeedReferences {
  propertyTypeIds: string[];
  layouts: { id: string; bedrooms: number }[];
  /** In sort order, so the first is the common simplex. */
  unitLevelIds: string[];
  furnishingTypeIds: string[];
  unitTagIds: string[];
  amenityIds: string[];
}

interface ContentSeedContext {
  operatorId: string;
  references: ContentSeedReferences;
  storage: FileStorage;
}

interface EmirateSeed {
  key: string;
  nameEn: string;
  nameAr: string;
  lng: number;
  lat: number;
  communities: readonly (readonly [
    key: string,
    nameEn: string,
    nameAr: string,
    lng: number,
    lat: number,
  ])[];
}

// Approximate center points, by place name. Developer-branded community names are left out on purpose.
const EMIRATES: readonly EmirateSeed[] = [
  {
    key: 'abu-dhabi',
    nameEn: 'Abu Dhabi',
    nameAr: 'أبوظبي',
    lng: 54.3773,
    lat: 24.4539,
    communities: [
      ['al-reem-island', 'Al Reem Island', 'جزيرة الريم', 54.4013, 24.4975],
      ['saadiyat-island', 'Saadiyat Island', 'جزيرة السعديات', 54.4339, 24.5425],
      ['yas-island', 'Yas Island', 'جزيرة ياس', 54.607, 24.488],
      ['khalifa-city', 'Khalifa City', 'مدينة خليفة', 54.576, 24.419],
    ],
  },
  {
    key: 'dubai',
    nameEn: 'Dubai',
    nameAr: 'دبي',
    lng: 55.2708,
    lat: 25.2048,
    communities: [
      ['dubai-marina', 'Dubai Marina', 'مرسى دبي', 55.1405, 25.0805],
      ['downtown-dubai', 'Downtown Dubai', 'وسط مدينة دبي', 55.2744, 25.1972],
      ['business-bay', 'Business Bay', 'الخليج التجاري', 55.264, 25.185],
      ['jumeirah-village-circle', 'Jumeirah Village Circle', 'قرية جميرا الدائرية', 55.209, 25.06],
    ],
  },
  {
    key: 'sharjah',
    nameEn: 'Sharjah',
    nameAr: 'الشارقة',
    lng: 55.4033,
    lat: 25.3463,
    communities: [
      ['al-khan', 'Al Khan', 'الخان', 55.38, 25.327],
      ['al-majaz', 'Al Majaz', 'المجاز', 55.388, 25.326],
      ['muwaileh', 'Muwaileh', 'مويلح', 55.445, 25.303],
      ['al-nahda-sharjah', 'Al Nahda', 'النهدة', 55.372, 25.296],
    ],
  },
  {
    key: 'ajman',
    nameEn: 'Ajman',
    nameAr: 'عجمان',
    lng: 55.44,
    lat: 25.41,
    communities: [
      ['al-nuaimiya', 'Al Nuaimiya', 'النعيمية', 55.46, 25.39],
      ['al-rashidiya', 'Al Rashidiya', 'الراشدية', 55.445, 25.4],
      ['al-jurf', 'Al Jurf', 'الجرف', 55.51, 25.4],
    ],
  },
  {
    key: 'umm-al-quwain',
    nameEn: 'Umm Al Quwain',
    nameAr: 'أم القيوين',
    lng: 55.5532,
    lat: 25.5647,
    communities: [
      ['al-salamah', 'Al Salamah', 'السلمة', 55.575, 25.5],
      ['al-raas', 'Al Raas', 'الراس', 55.56, 25.575],
      ['al-humrah', 'Al Humrah', 'الحمرة', 55.57, 25.52],
    ],
  },
  {
    key: 'ras-al-khaimah',
    nameEn: 'Ras Al Khaimah',
    nameAr: 'رأس الخيمة',
    lng: 55.9432,
    lat: 25.7895,
    communities: [
      ['al-dhait', 'Al Dhait', 'الظيت', 55.99, 25.75],
      ['julphar', 'Julphar', 'جلفار', 55.95, 25.8],
      ['al-mamourah', 'Al Mamourah', 'المعمورة', 55.965, 25.79],
    ],
  },
  {
    key: 'fujairah',
    nameEn: 'Fujairah',
    nameAr: 'الفجيرة',
    lng: 56.3265,
    lat: 25.1288,
    communities: [
      ['al-faseel', 'Al Faseel', 'الفصيل', 56.355, 25.14],
      ['dibba-al-fujairah', 'Dibba Al-Fujairah', 'دبا الفجيرة', 56.27, 25.59],
      ['mirbah', 'Mirbah', 'مربح', 56.36, 25.275],
      ['al-hail', 'Al Hail', 'الحيل', 56.29, 25.09],
    ],
  },
];

const point = (lng: number, lat: number) => `SRID=4326;POINT(${lng} ${lat})`;
const areaId = (key: string) => seedId('area', key);

const COMMUNITIES = EMIRATES.flatMap((emirate) =>
  emirate.communities.map(([key, , , lng, lat]) => ({ id: areaId(key), lng, lat })),
);

/** FR-DAT-03, FR-LOC-04: the 7 emirates and their communities, all in the UAE. */
export async function seedAreas(db: SeedDb): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(areas)
      .values(
        EMIRATES.map(({ key, nameEn, nameAr, lng, lat }) => ({
          id: areaId(key),
          level: 'emirate' as const,
          nameEn,
          nameAr,
          center: point(lng, lat),
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(areas)
      .values(
        EMIRATES.flatMap((emirate) =>
          emirate.communities.map(([key, nameEn, nameAr, lng, lat]) => ({
            id: areaId(key),
            parentId: areaId(emirate.key),
            level: 'community' as const,
            nameEn,
            nameAr,
            center: point(lng, lat),
          })),
        ),
      )
      .onConflictDoNothing();
  });
}

// ---------- Building blocks shared by the demo and load seeds ----------

const LICENSE_NOTE = 'self-produced';
const INSERT_BATCH = 1_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 20; // FR-PRJ-03: older than the default threshold of 14 days.

const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** FR-DAT-05: everything about a project's stage and dates that publishing asks for. */
function buildLifecycle(random: SeedRandom, index: number) {
  const thisYear = new Date().getUTCFullYear();
  const stage = (['under_construction', 'upcoming', 'ready'] as const)[index % 3] as
    'under_construction' | 'upcoming' | 'ready';
  if (stage === 'ready') {
    return { stage, actualHandoverDate: isoDate(daysFromNow(-random.int(30, 700))) };
  }
  return {
    stage,
    handoverQuarter: random.int(1, 4),
    handoverYear: thisYear + (stage === 'upcoming' ? random.int(2, 4) : random.int(1, 3)),
    ...(stage === 'upcoming'
      ? { expectedLaunchDate: isoDate(daysFromNow(random.int(30, 300))) }
      : {}),
  };
}

function buildOwnership(random: SeedRandom) {
  return random.next() < 0.2
    ? { ownershipType: 'leasehold' as const, leaseTermYears: 99 }
    : { ownershipType: 'freehold' as const };
}

const scatter = (random: SeedRandom, center: { lng: number; lat: number }, spread: number) =>
  point(
    Number((center.lng + random.float(-spread, spread)).toFixed(6)),
    Number((center.lat + random.float(-spread, spread)).toFixed(6)),
  );

type MilestoneTemplate = readonly [
  labelEn: string,
  labelAr: string,
  percentage: string,
  timing: 'on_booking' | 'on_date' | 'construction_stage' | 'on_handover' | 'after_handover',
  extra?: { constructionPct?: number; monthsAfterHandover?: number; dueInDays?: number },
];

// BR-02: each of these totals exactly 100%, which the database checks at commit.
const PLAN_TEMPLATES: readonly { name: string; milestones: readonly MilestoneTemplate[] }[] = [
  {
    name: '60/40 plan',
    milestones: [
      ['On booking', 'عند الحجز', '10.00', 'on_booking'],
      [
        'During construction',
        'أثناء البناء',
        '50.00',
        'construction_stage',
        { constructionPct: 50 },
      ],
      ['On handover', 'عند التسليم', '40.00', 'on_handover'],
    ],
  },
  {
    name: 'Post-handover plan',
    milestones: [
      ['On booking', 'عند الحجز', '10.00', 'on_booking'],
      [
        'During construction',
        'أثناء البناء',
        '40.00',
        'construction_stage',
        { constructionPct: 60 },
      ],
      ['On handover', 'عند التسليم', '20.00', 'on_handover'],
      ['After handover', 'بعد التسليم', '30.00', 'after_handover', { monthsAfterHandover: 24 }],
    ],
  },
  {
    name: 'Dated plan',
    milestones: [
      ['On booking', 'عند الحجز', '20.00', 'on_booking'],
      ['Second payment', 'الدفعة الثانية', '30.00', 'on_date', { dueInDays: 180 }],
      ['On handover', 'عند التسليم', '50.00', 'on_handover'],
    ],
  },
];

function buildPlan(scope: string, projectId: string, templateIndex: number, isDefault: boolean) {
  const template = PLAN_TEMPLATES[
    templateIndex % PLAN_TEMPLATES.length
  ] as (typeof PLAN_TEMPLATES)[number];
  const id = seedId('payment-plan', scope, projectId, templateIndex);
  return {
    plan: { id, projectId, name: template.name, isDefault },
    milestones: template.milestones.map(([labelEn, labelAr, percentage, timing, extra], index) => ({
      id: seedId('payment-plan-milestone', id, index),
      planId: id,
      seq: index + 1,
      labelEn,
      labelAr,
      percentage,
      timing,
      constructionPct: extra?.constructionPct,
      monthsAfterHandover: extra?.monthsAfterHandover,
      dueDate: extra?.dueInDays === undefined ? undefined : isoDate(daysFromNow(extra.dueInDays)),
    })),
  };
}

function buildFloor(random: SeedRandom) {
  const roll = random.next();
  if (roll < 0.03) return { floorLabel: 'B', floorSortKey: -1 };
  if (roll < 0.08) return { floorLabel: 'G', floorSortKey: 0 };
  if (roll < 0.11) return { floorLabel: 'M', floorSortKey: 1 };
  const floor = random.int(1, 40);
  return { floorLabel: String(floor), floorSortKey: floor + 1 };
}

function buildStatus(random: SeedRandom) {
  const roll = random.next();
  if (roll < 0.65) return 'available' as const;
  if (roll < 0.8) return 'reserved' as const;
  if (roll < 0.95) return 'sold' as const;
  return 'on_request' as const;
}

const VIEWS = ['Sea view', 'City view', 'Garden view', 'Pool view', 'Community view'];

function buildUnits(
  scope: string,
  projectId: string,
  count: number,
  references: ContentSeedReferences,
) {
  const random = createSeedRandom(`units:${scope}:${projectId}`);
  const pricePerSqm = random.int(9_000, 30_000);

  return Array.from({ length: count }, (_, index) => {
    const layout = random.pick(references.layouts);
    const internalArea = random.int(35 + layout.bedrooms * 45, 60 + layout.bedrooms * 60);
    const status = buildStatus(random);
    // Whole thousands of AED from whole numbers, so no float reaches a price.
    const price = Math.round((internalArea * pricePerSqm) / 1_000) * 1_000;
    return {
      id: seedId('unit', scope, projectId, index),
      projectId,
      unitNumber: `U-${String(index + 1).padStart(4, '0')}`,
      propertyTypeId: random.pick(references.propertyTypeIds),
      layoutId: layout.id,
      unitLevelId: (random.next() < 0.85
        ? references.unitLevelIds[0]
        : random.pick(references.unitLevelIds)) as string,
      furnishingTypeId: random.pick(references.furnishingTypeIds),
      bathrooms: layout.bedrooms + 1,
      internalAreaSqm: `${internalArea}.00`,
      totalAreaSqm: `${internalArea + random.int(0, 25)}.00`,
      ...buildFloor(random),
      view: random.pick(VIEWS),
      priceAed: status === 'on_request' ? null : `${price}.00`,
      status,
    };
  });
}

/** A self-made image: a diagonal two-color gradient, written as a PNG without any library. */
function renderPlaceholderPng(seed: string, width = 640, height = 360): Buffer {
  const random = createSeedRandom(`placeholder:${seed}`);
  const color = () => [random.int(30, 225), random.int(30, 225), random.int(30, 225)] as const;
  const [from, to] = [color(), color()];

  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride; // The first byte of each row stays 0: no PNG filter.
    for (let x = 0; x < width; x += 1) {
      const mix = (x / width + y / height) / 2;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[row + 1 + x * 3 + channel] = Math.round(
          (from[channel] as number) * (1 - mix) + (to[channel] as number) * mix,
        );
      }
    }
  }

  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlacing.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const storePlaceholder = (storage: FileStorage, seed: string, directory: string) =>
  storage.save(Readable.from([renderPlaceholderPng(seed)]), {
    directory,
    maxBytes: 10 * 1024 * 1024, // FR-DAT-06: images up to 10 MB.
    allowed: ['png'],
  });

type Rows<T extends { $inferInsert: unknown }> = T['$inferInsert'][];

/** Everything of one or more projects that belongs in the same transaction. */
async function insertProjectGraph(
  db: SeedDb,
  graph: {
    projects: Rows<typeof projects>;
    verifications: Rows<typeof projectVerifications>;
    plans: Rows<typeof paymentPlans>;
    milestones: Rows<typeof paymentPlanMilestones>;
    amenities: Rows<typeof projectAmenities>;
    contacts: Rows<typeof projectSalesContacts>;
    units: Rows<typeof units>;
    unitTags?: Rows<typeof unitTagLinks>;
  },
): Promise<void> {
  const insertAll = async <T extends object>(
    rows: readonly T[],
    insert: (batch: T[]) => Promise<unknown>,
  ) => {
    for (const batch of inBatches(rows, INSERT_BATCH)) {
      await insert(batch);
    }
  };

  await db.transaction(async (tx) => {
    await insertAll(graph.projects, (rows) =>
      tx.insert(projects).values(rows).onConflictDoNothing(),
    );
    await insertAll(graph.verifications, (rows) =>
      tx.insert(projectVerifications).values(rows).onConflictDoNothing(),
    );
    await insertAll(graph.plans, (rows) =>
      tx.insert(paymentPlans).values(rows).onConflictDoNothing(),
    );
    await insertAll(graph.milestones, (rows) =>
      tx.insert(paymentPlanMilestones).values(rows).onConflictDoNothing(),
    );
    await insertAll(graph.amenities, (rows) =>
      tx.insert(projectAmenities).values(rows).onConflictDoNothing(),
    );
    await insertAll(graph.contacts, (rows) =>
      tx.insert(projectSalesContacts).values(rows).onConflictDoNothing(),
    );
    await insertAll(graph.units, (rows) => tx.insert(units).values(rows).onConflictDoNothing());
    await insertAll(graph.unitTags ?? [], (rows) =>
      tx.insert(unitTagLinks).values(rows).onConflictDoNothing(),
    );
  });
}

// ---------- Demo seed (D-02) ----------

export const DEMO_PROJECT_COUNT = 30;

// Invented names. The first names and the second names make 30 different pairs.
const DEMO_DEVELOPERS = [
  ['lumera', 'Lumera Estates', 'لوميرا العقارية'],
  ['qamar-ridge', 'Qamar Ridge Developments', 'قمر ريدج للتطوير'],
  ['zafran-bay', 'Zafran Bay Properties', 'زعفران باي العقارية'],
  ['tamrah', 'Tamrah Living', 'تمرة ليفينغ'],
  ['areej-skyline', 'Areej Skyline Developments', 'أريج سكايلاين للتطوير'],
  ['noor-vantage', 'Noor Vantage Homes', 'نور فانتج هومز'],
] as const;

const DEMO_FIRST_NAMES = [
  ['Amber', 'العنبر'],
  ['Cedar', 'الأرز'],
  ['Coral', 'المرجان'],
  ['Dune', 'الكثبان'],
  ['Falcon', 'الصقر'],
  ['Garnet', 'العقيق'],
  ['Harbor', 'الميناء'],
  ['Indigo', 'النيلي'],
  ['Jasmine', 'الياسمين'],
  ['Lagoon', 'البحيرة'],
] as const;

const DEMO_SECOND_NAMES = [
  ['Residences', 'مساكن'],
  ['Heights', 'مرتفعات'],
  ['Gardens', 'حدائق'],
  ['Towers', 'أبراج'],
  ['Court', 'ساحة'],
  ['Terraces', 'شرفات'],
] as const;

const DEMO_SOURCE = 'Fictional sample data created by the REIH team (D-02)';

/** D-02: fictional developers and 30 published projects, each complete under FR-DAT-05. */
export async function seedDemoContent(db: SeedDb, context: ContentSeedContext): Promise<void> {
  const { operatorId, references, storage } = context;

  const developerRows = DEMO_DEVELOPERS.map(([key, nameEn, nameAr]) => ({
    id: seedId('developer', 'demo', key),
    nameEn,
    nameAr,
    descriptionEn: `${nameEn} is a fictional developer used for the REIH demonstration.`,
    descriptionAr: `${nameAr} شركة تطوير خيالية مخصصة لعرض منصة REIH.`,
  }));
  const contactRows = DEMO_DEVELOPERS.flatMap(([key], developerIndex) =>
    [0, 1].map((contactIndex) => ({
      id: seedId('sales-contact', 'demo', key, contactIndex),
      developerId: seedId('developer', 'demo', key),
      fullName: `Demo Sales Manager ${developerIndex * 2 + contactIndex + 1}`,
      title: 'Sales manager',
      phone: `+97155500${String(developerIndex * 2 + contactIndex + 1).padStart(4, '0')}`,
      whatsapp: `+97155500${String(developerIndex * 2 + contactIndex + 1).padStart(4, '0')}`,
      email: `sales.${key}.${contactIndex + 1}@example.test`,
      languages: ['ar', 'en'],
      verifiedAt: isoDate(new Date()),
      verificationSource: DEMO_SOURCE,
    })),
  );

  const graph: Parameters<typeof insertProjectGraph>[1] = {
    projects: [],
    verifications: [],
    plans: [],
    milestones: [],
    amenities: [],
    contacts: [],
    units: [],
    unitTags: [],
  };

  for (let index = 0; index < DEMO_PROJECT_COUNT; index += 1) {
    const random = createSeedRandom(`demo-project:${index}`);
    const id = seedId('project', 'demo', index);
    const [firstEn, firstAr] = DEMO_FIRST_NAMES[index % DEMO_FIRST_NAMES.length] as readonly [
      string,
      string,
    ];
    const [secondEn, secondAr] = DEMO_SECOND_NAMES[index % DEMO_SECOND_NAMES.length] as readonly [
      string,
      string,
    ];
    const developer = DEMO_DEVELOPERS[
      index % DEMO_DEVELOPERS.length
    ] as (typeof DEMO_DEVELOPERS)[number];
    const community = COMMUNITIES[index % COMMUNITIES.length] as (typeof COMMUNITIES)[number];
    // Every sixth project is past the stale threshold, so the badge can be shown (FR-PRJ-03).
    const verifiedAt = daysFromNow(index % 6 === 5 ? -STALE_DAYS : -random.int(0, 10));

    graph.projects.push({
      id,
      developerId: seedId('developer', 'demo', developer[0]),
      communityId: community.id,
      nameEn: `${firstEn} ${secondEn}`,
      nameAr: `${secondAr} ${firstAr}`,
      descriptionEn: `${firstEn} ${secondEn} is a fictional project created for the REIH demonstration.`,
      descriptionAr: `${secondAr} ${firstAr} مشروع خيالي أُنشئ لعرض منصة REIH.`,
      location: scatter(random, community, 0.008),
      ...buildLifecycle(random, index),
      ...buildOwnership(random),
      serviceChargeAedSqm: `${random.int(10, 30)}.00`,
      status: 'published',
      publishedAt: verifiedAt,
      lastVerifiedAt: verifiedAt,
      lastVerificationSource: DEMO_SOURCE,
      createdBy: operatorId,
      updatedBy: operatorId,
    });
    graph.verifications.push({
      id: seedId('project-verification', 'demo', index),
      projectId: id,
      verifiedAt,
      source: DEMO_SOURCE,
      verifiedBy: operatorId,
    });

    for (const [templateOffset, isDefault] of [
      [0, true],
      [1, false],
    ] as const) {
      const { plan, milestones } = buildPlan('demo', id, index + templateOffset, isDefault);
      graph.plans.push(plan);
      graph.milestones.push(...milestones);
    }

    for (const amenityId of random.sample(references.amenityIds, random.int(5, 8))) {
      graph.amenities.push({ projectId: id, amenityId });
    }
    for (const contactIndex of [0, 1]) {
      graph.contacts.push({
        projectId: id,
        salesContactId: seedId('sales-contact', 'demo', developer[0], contactIndex),
      });
    }

    const projectUnits = buildUnits('demo', id, random.int(12, 40), references);
    graph.units.push(...projectUnits);
    for (const unit of projectUnits) {
      if (random.next() < 0.3) {
        for (const unitTagId of random.sample(references.unitTagIds, random.int(1, 2))) {
          graph.unitTags?.push({ unitId: unit.id, unitTagId });
        }
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(developers).values(developerRows).onConflictDoNothing();
    await tx.insert(salesContacts).values(contactRows).onConflictDoNothing();
    await insertProjectGraph(tx, graph);
  });

  await seedDemoImages(db, storage, operatorId);
}

/** BR-14: two self-made images per project. Only a missing row writes a file. */
async function seedDemoImages(db: SeedDb, storage: FileStorage, operatorId: string): Promise<void> {
  const images = Array.from({ length: DEMO_PROJECT_COUNT }, (_, index) =>
    (['Exterior view', 'Building view'] as const).map((title, displayOrder) => ({
      id: seedId('media-file', 'demo', index, displayOrder),
      projectId: seedId('project', 'demo', index),
      title,
      displayOrder,
    })),
  ).flat();

  const existing = new Set(
    (
      await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(
          inArray(
            mediaFiles.id,
            images.map(({ id }) => id),
          ),
        )
    ).map(({ id }) => id),
  );

  for (const image of images.filter(({ id }) => !existing.has(id))) {
    const stored = await storePlaceholder(storage, image.id, 'seed/demo');
    await db
      .insert(mediaFiles)
      .values({
        ...image,
        type: 'image',
        filePath: stored.key,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        sourceNote: DEMO_SOURCE,
        licenseNote: LICENSE_NOTE,
        uploadedBy: operatorId,
      })
      .onConflictDoNothing();
  }
}

// ---------- Load seed (NFR-01 to NFR-05) ----------

export interface LoadSeedSize {
  projects: number;
  units: number;
  /** NFR-03: projects with exactly 500 units. */
  largeProjects: number;
  developers: number;
}

/** NFR-05 and NFR-03. */
export const FULL_LOAD_SIZE: LoadSeedSize = {
  projects: 5_000,
  units: 250_000,
  largeProjects: 50,
  developers: 200,
};

const LARGE_PROJECT_UNITS = 500;
const PROJECTS_PER_TRANSACTION = 100;
const LOAD_SOURCE = 'Synthetic data for load tests (NFR-05)';

/** Units per project: varied, but adding up to exactly size.units. */
export function planUnitCounts(size: LoadSeedSize): number[] {
  const { projects: projectCount, units: unitCount, largeProjects } = size;
  const smallProjects = projectCount - largeProjects;
  const smallUnits = unitCount - largeProjects * LARGE_PROJECT_UNITS;
  if (smallProjects <= 0 || smallUnits < smallProjects) {
    throw new RangeError('The load size leaves too few units for the other projects');
  }

  const base = Math.floor(smallUnits / smallProjects);
  const counts = Array.from({ length: smallProjects }, (_, index) =>
    index < smallUnits % smallProjects ? base + 1 : base,
  );
  // Move units between pairs, so the total stays the same while the sizes differ.
  const random = createSeedRandom('load-unit-counts');
  for (let index = 0; index + 1 < counts.length; index += 2) {
    const moved = random.int(0, Math.min(base - 1, 30));
    counts[index] = (counts[index] as number) + moved;
    counts[index + 1] = (counts[index + 1] as number) - moved;
  }

  // The large projects are spread evenly through the list.
  const step = Math.floor(projectCount / Math.max(largeProjects, 1));
  const result: number[] = [];
  let small = 0;
  let large = 0;
  for (let index = 0; index < projectCount; index += 1) {
    if (large < largeProjects && index % step === 0) {
      result.push(LARGE_PROJECT_UNITS);
      large += 1;
    } else {
      result.push(counts[small] as number);
      small += 1;
    }
  }
  return result;
}

/**
 * NFR-05: every project is published and complete under FR-DAT-05. Each transaction holds a whole
 * group of projects, so a stopped run resumes by skipping the groups already there.
 */
export async function seedLoadContent(
  db: SeedDb,
  context: ContentSeedContext & {
    size?: LoadSeedSize;
    onProgress?: (doneProjects: number, totalProjects: number) => void;
  },
): Promise<void> {
  const { operatorId, references, storage, size = FULL_LOAD_SIZE, onProgress } = context;
  const unitCounts = planUnitCounts(size);

  const developerIds = Array.from({ length: size.developers }, (_, index) =>
    seedId('developer', 'load', index),
  );
  const contactIds = developerIds.map((_, index) => seedId('sales-contact', 'load', index));

  for (const batch of inBatches(
    developerIds.map((id, index) => {
      const number = String(index + 1).padStart(3, '0');
      return { id, nameEn: `Load Developer ${number}`, nameAr: `مطور اختبار ${number}` };
    }),
    INSERT_BATCH,
  )) {
    await db.insert(developers).values(batch).onConflictDoNothing();
  }
  for (const batch of inBatches(
    contactIds.map((id, index) => {
      const number = String(index + 1).padStart(4, '0');
      return {
        id,
        developerId: developerIds[index] as string,
        fullName: `Load Contact ${number}`,
        phone: `+97155600${number}`,
        email: `load.${number}@example.test`,
        languages: ['ar', 'en'],
      };
    }),
    INSERT_BATCH,
  )) {
    await db.insert(salesContacts).values(batch).onConflictDoNothing();
  }

  const placeholder = await loadPlaceholder(db, storage);
  const indexes = Array.from({ length: size.projects }, (_, index) => index);
  let done = 0;

  for (const group of inBatches(indexes, PROJECTS_PER_TRANSACTION)) {
    done += group.length;
    const lastId = seedId('project', 'load', group[group.length - 1] as number);
    const [alreadyThere] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, lastId));
    if (alreadyThere) {
      onProgress?.(done, size.projects);
      continue;
    }

    const graph: Parameters<typeof insertProjectGraph>[1] = {
      projects: [],
      verifications: [],
      plans: [],
      milestones: [],
      amenities: [],
      contacts: [],
      units: [],
    };
    const media: Rows<typeof mediaFiles> = [];

    for (const index of group) {
      const random = createSeedRandom(`load-project:${index}`);
      const id = seedId('project', 'load', index);
      const number = String(index + 1).padStart(5, '0');
      const developerIndex = index % size.developers;
      const verifiedAt = daysFromNow(random.next() < 0.05 ? -STALE_DAYS : -random.int(0, 10));
      const community = random.pick(COMMUNITIES);

      graph.projects.push({
        id,
        developerId: developerIds[developerIndex] as string,
        communityId: community.id,
        nameEn: `Load Project ${number}`,
        nameAr: `مشروع اختبار ${number}`,
        location: scatter(random, community, 0.02),
        ...buildLifecycle(random, index),
        ...buildOwnership(random),
        status: 'published',
        publishedAt: verifiedAt,
        lastVerifiedAt: verifiedAt,
        lastVerificationSource: LOAD_SOURCE,
        createdBy: operatorId,
        updatedBy: operatorId,
      });
      graph.verifications.push({
        id: seedId('project-verification', 'load', index),
        projectId: id,
        verifiedAt,
        source: LOAD_SOURCE,
        verifiedBy: operatorId,
      });
      media.push({
        id: seedId('media-file', 'load', index),
        projectId: id,
        type: 'image',
        title: 'Placeholder image',
        filePath: placeholder.key,
        mimeType: placeholder.mimeType,
        sizeBytes: placeholder.sizeBytes,
        sourceNote: LOAD_SOURCE,
        licenseNote: LICENSE_NOTE,
        uploadedBy: operatorId,
      });

      const { plan, milestones } = buildPlan('load', id, index, true);
      graph.plans.push(plan);
      graph.milestones.push(...milestones);

      for (const amenityId of random.sample(references.amenityIds, 5)) {
        graph.amenities.push({ projectId: id, amenityId });
      }
      graph.contacts.push({ projectId: id, salesContactId: contactIds[developerIndex] as string });
      graph.units.push(...buildUnits('load', id, unitCounts[index] as number, references));
    }

    await db.transaction(async (tx) => {
      await insertProjectGraph(tx, graph);
      await tx.insert(mediaFiles).values(media).onConflictDoNothing();
    });
    onProgress?.(done, size.projects);
  }
}

/** All load projects share one image file, so the disk holds it once. */
async function loadPlaceholder(db: SeedDb, storage: FileStorage) {
  const [existing] = await db
    .select({
      key: mediaFiles.filePath,
      mimeType: mediaFiles.mimeType,
      sizeBytes: mediaFiles.sizeBytes,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.id, seedId('media-file', 'load', 0)));
  return existing ?? storePlaceholder(storage, 'load', 'seed/load');
}
