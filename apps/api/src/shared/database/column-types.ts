import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

// node-postgres returns geography values as hex EWKB text. Queries that need coordinates
// select them through PostGIS functions.
export const geographyPoint = customType<{ data: string }>({
  dataType: () => 'geography(Point,4326)',
});

export const geographyMultiPolygon = customType<{ data: string }>({
  dataType: () => 'geography(MultiPolygon,4326)',
});

export const primaryId = () => uuid('id').primaryKey().defaultRandom();
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
export const createdAt = () => timestamptz('created_at').notNull().defaultNow();
export const updatedAt = () => timestamptz('updated_at').notNull().defaultNow();
