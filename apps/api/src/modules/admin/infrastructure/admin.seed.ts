import { asc, eq } from 'drizzle-orm';
import { recordSeedAudit } from '../../../shared/audit/index.js';
import { seedId, type SeedDb } from '../../../shared/database/seed-helpers.js';
import {
  amenities,
  amenityCategories,
  currencies,
  exchangeRates,
  furnishingTypes,
  layouts,
  propertyTypes,
  settings,
  unitLevels,
  unitTags,
} from './admin.schema.js';

type Lookup = readonly [code: string, nameEn: string, nameAr: string];

const CURRENCIES = [
  { code: 'AED', symbol: 'د.إ', nameEn: 'UAE Dirham', nameAr: 'درهم إماراتي', isEnabled: true },
  { code: 'USD', symbol: '$', nameEn: 'US Dollar', nameAr: 'دولار أمريكي', isEnabled: false },
  { code: 'EUR', symbol: '€', nameEn: 'Euro', nameAr: 'يورو', isEnabled: false },
  { code: 'GBP', symbol: '£', nameEn: 'British Pound', nameAr: 'جنيه إسترليني', isEnabled: false },
  { code: 'SAR', symbol: 'ر.س', nameEn: 'Saudi Riyal', nameAr: 'ريال سعودي', isEnabled: false },
];

const PROPERTY_TYPES: readonly Lookup[] = [
  ['apartment', 'Apartment', 'شقة'],
  ['villa', 'Villa', 'فيلا'],
  ['townhouse', 'Townhouse', 'تاون هاوس'],
  ['penthouse', 'Penthouse', 'بنتهاوس'],
  ['hotel_apartment', 'Hotel apartment', 'شقة فندقية'],
];

const LAYOUTS = [
  { code: 'studio', bedrooms: 0, nameEn: 'Studio', nameAr: 'استوديو' },
  { code: '1br', bedrooms: 1, nameEn: '1 bedroom', nameAr: 'غرفة نوم واحدة' },
  { code: '2br', bedrooms: 2, nameEn: '2 bedrooms', nameAr: 'غرفتا نوم' },
  { code: '3br', bedrooms: 3, nameEn: '3 bedrooms', nameAr: '3 غرف نوم' },
  { code: '4br', bedrooms: 4, nameEn: '4 bedrooms', nameAr: '4 غرف نوم' },
  { code: '5br', bedrooms: 5, nameEn: '5 bedrooms', nameAr: '5 غرف نوم' },
  { code: '6plus', bedrooms: 6, nameEn: '6+ bedrooms', nameAr: '6 غرف نوم أو أكثر' },
];

const UNIT_LEVELS: readonly Lookup[] = [
  ['simplex', 'Simplex', 'سيمبلكس'],
  ['duplex', 'Duplex', 'دوبلكس'],
  ['triplex', 'Triplex', 'تريبلكس'],
  ['loft', 'Loft', 'لوفت'],
];

const FURNISHING_TYPES: readonly Lookup[] = [
  ['unfurnished', 'Unfurnished', 'غير مفروشة'],
  ['semi_furnished', 'Semi-furnished', 'مفروشة جزئيًا'],
  ['furnished', 'Furnished', 'مفروشة'],
];

const UNIT_TAGS: readonly Lookup[] = [
  ['corner_unit', 'Corner unit', 'وحدة زاوية'],
  ['high_floor', 'High floor', 'طابق مرتفع'],
  ['private_pool', 'Private pool', 'مسبح خاص'],
  ['private_garden', 'Private garden', 'حديقة خاصة'],
  ['maids_room', "Maid's room", 'غرفة خادمة'],
  ['study', 'Study', 'غرفة مكتب'],
];

const AMENITY_CATEGORIES: readonly {
  key: string;
  nameEn: string;
  nameAr: string;
  amenities: readonly Lookup[];
}[] = [
  {
    key: 'recreation',
    nameEn: 'Recreation',
    nameAr: 'الترفيه',
    amenities: [
      ['swimming_pool', 'Swimming pool', 'مسبح'],
      ['bbq_area', 'BBQ area', 'منطقة شواء'],
      ['clubhouse', 'Clubhouse', 'نادٍ اجتماعي'],
      ['landscaped_gardens', 'Landscaped gardens', 'حدائق منسقة'],
    ],
  },
  {
    key: 'fitness',
    nameEn: 'Fitness and wellness',
    nameAr: 'اللياقة والعافية',
    amenities: [
      ['gym', 'Gym', 'نادٍ رياضي'],
      ['spa', 'Spa', 'منتجع صحي'],
      ['sauna', 'Sauna', 'ساونا'],
      ['jogging_track', 'Jogging track', 'مسار للجري'],
    ],
  },
  {
    key: 'family',
    nameEn: 'Family',
    nameAr: 'العائلة',
    amenities: [
      ['play_area', "Children's play area", 'منطقة لعب للأطفال'],
      ['kids_pool', "Children's pool", 'مسبح للأطفال'],
      ['nursery', 'Nursery', 'حضانة'],
    ],
  },
  {
    key: 'security',
    nameEn: 'Security',
    nameAr: 'الأمن',
    amenities: [
      ['security_24h', '24-hour security', 'أمن على مدار الساعة'],
      ['cctv', 'CCTV', 'كاميرات مراقبة'],
      ['controlled_access', 'Controlled access', 'دخول مراقب'],
    ],
  },
  {
    key: 'services',
    nameEn: 'Services',
    nameAr: 'الخدمات',
    amenities: [
      ['concierge', 'Concierge', 'خدمة الكونسيرج'],
      ['retail_shops', 'Retail shops', 'محلات تجارية'],
      ['maintenance', 'Maintenance service', 'خدمة الصيانة'],
      ['cleaning', 'Cleaning services', 'خدمات التنظيف'],
    ],
  },
  {
    key: 'parking',
    nameEn: 'Parking and transport',
    nameAr: 'المواقف والنقل',
    amenities: [
      ['covered_parking', 'Covered parking', 'مواقف مغطاة'],
      ['visitor_parking', 'Visitor parking', 'مواقف للزوار'],
      ['ev_charging', 'EV charging', 'شحن السيارات الكهربائية'],
    ],
  },
];

/** Illustrative values for the demonstration only, not market rates. */
const DEMO_RATES: readonly { code: string; aedPerUnit: string }[] = [
  { code: 'USD', aedPerUnit: '3.67250000' },
  { code: 'EUR', aedPerUnit: '4.00000000' },
  { code: 'GBP', aedPerUnit: '4.65000000' },
  { code: 'SAR', aedPerUnit: '0.97930000' },
];

const DEMO_RATE_REASON = 'Demo values for the demonstration, not market rates (db:seed:demo)';

const lookupRows = (entries: readonly Lookup[]) =>
  entries.map(([code, nameEn, nameAr], index) => ({ code, nameEn, nameAr, sortOrder: index }));

export async function seedAdminReference(db: SeedDb): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(currencies).values(CURRENCIES).onConflictDoNothing();
    await tx.insert(propertyTypes).values(lookupRows(PROPERTY_TYPES)).onConflictDoNothing();
    await tx
      .insert(layouts)
      .values(LAYOUTS.map((layout, index) => ({ ...layout, sortOrder: index })))
      .onConflictDoNothing();
    await tx.insert(unitLevels).values(lookupRows(UNIT_LEVELS)).onConflictDoNothing();
    await tx.insert(furnishingTypes).values(lookupRows(FURNISHING_TYPES)).onConflictDoNothing();
    await tx.insert(unitTags).values(lookupRows(UNIT_TAGS)).onConflictDoNothing();

    await tx
      .insert(amenityCategories)
      .values(
        AMENITY_CATEGORIES.map(({ key, nameEn, nameAr }, index) => ({
          id: seedId('amenity-category', key),
          nameEn,
          nameAr,
          sortOrder: index,
        })),
      )
      .onConflictDoNothing();
    await tx
      .insert(amenities)
      .values(
        AMENITY_CATEGORIES.flatMap((category) =>
          category.amenities.map(([key, nameEn, nameAr]) => ({
            id: seedId('amenity', key),
            categoryId: seedId('amenity-category', category.key),
            nameEn,
            nameAr,
          })),
        ),
      )
      .onConflictDoNothing();

    // settings has no unique column and holds one row, which migration 0002 already creates.
    const [row] = await tx.select({ id: settings.id }).from(settings).limit(1);
    if (!row) {
      await tx.insert(settings).values({});
    }
  });
}

/**
 * D-02: demo rates, enabling each currency when its rate is first created. A later run adds nothing
 * and leaves alone a currency that an admin has since disabled. exchange_rates has no note column,
 * so an audit row marks each rate as a demo value, and entered_by names the System seed user.
 */
export async function seedDemoExchangeRates(db: SeedDb, operatorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { code, aedPerUnit } of DEMO_RATES) {
      const [currency] = await tx
        .select({ id: currencies.id })
        .from(currencies)
        .where(eq(currencies.code, code));
      const currencyId = (currency as { id: string }).id;

      const created = await tx
        .insert(exchangeRates)
        .values({
          id: seedId('demo-exchange-rate', code),
          currencyId,
          aedPerUnit,
          effectiveAt: new Date(),
          enteredBy: operatorId,
        })
        .onConflictDoNothing()
        .returning({ id: exchangeRates.id });

      const rate = created[0];
      if (rate) {
        await tx
          .update(currencies)
          .set({ isEnabled: true, updatedAt: new Date() })
          .where(eq(currencies.id, currencyId));
        await recordSeedAudit(tx, {
          actorId: operatorId,
          action: 'demo_seed',
          entityType: 'exchange_rates',
          entityId: rate.id,
          newValues: { currency: code, aedPerUnit },
          reason: DEMO_RATE_REASON,
        });
      }
    }
  });
}

/** What the content seeds need to know about the reference data, read rather than assumed. */
export async function readSeedReferences(db: SeedDb) {
  const ids = (rows: { id: string }[]) => rows.map(({ id }) => id);
  return {
    propertyTypeIds: ids(
      await db
        .select({ id: propertyTypes.id })
        .from(propertyTypes)
        .orderBy(asc(propertyTypes.sortOrder)),
    ),
    layouts: await db
      .select({ id: layouts.id, bedrooms: layouts.bedrooms })
      .from(layouts)
      .orderBy(asc(layouts.sortOrder)),
    unitLevelIds: ids(
      await db.select({ id: unitLevels.id }).from(unitLevels).orderBy(asc(unitLevels.sortOrder)),
    ),
    furnishingTypeIds: ids(
      await db
        .select({ id: furnishingTypes.id })
        .from(furnishingTypes)
        .orderBy(asc(furnishingTypes.sortOrder)),
    ),
    unitTagIds: ids(
      await db.select({ id: unitTags.id }).from(unitTags).orderBy(asc(unitTags.sortOrder)),
    ),
    amenityIds: ids(
      await db.select({ id: amenities.id }).from(amenities).orderBy(asc(amenities.id)),
    ),
  };
}
