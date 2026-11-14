import { randomUUID } from 'node:crypto';
import type { useIdentityApp } from './identity-app.js';

type App = ReturnType<typeof useIdentityApp>;

/**
 * Rows the content tests need, written straight to the test database: those whose endpoint does
 * not exist yet, and those a test needs in a state the API would refuse to create.
 */
export function contentFixtures(h: App) {
  const tag = () => randomUUID().slice(0, 8);

  async function developer(status: 'active' | 'archived' = 'active'): Promise<string> {
    const id = randomUUID();
    await h.db.query(
      'INSERT INTO developers (id, name_ar, name_en, status) VALUES ($1, $2, $3, $4)',
      [id, `مطوّر ${tag()}`, `Fixture Developer ${tag()}`, status],
    );
    return id;
  }

  async function emirate(): Promise<string> {
    const id = randomUUID();
    await h.db.query(
      `INSERT INTO areas (id, level, name_ar, name_en, center)
       VALUES ($1, 'emirate', $2, $3, ST_SetSRID(ST_MakePoint(55.27, 25.2), 4326)::geography)`,
      [id, `إمارة ${tag()}`, `Fixture Emirate ${tag()}`],
    );
    return id;
  }

  async function community(parentId: string): Promise<string> {
    const id = randomUUID();
    await h.db.query(
      `INSERT INTO areas (id, parent_id, level, name_ar, name_en, center)
       VALUES ($1, $2, 'community', $3, $4,
         ST_SetSRID(ST_MakePoint(55.14, 25.08), 4326)::geography)`,
      [id, parentId, `منطقة ${tag()}`, `Fixture Community ${tag()}`],
    );
    return id;
  }

  async function project(input: {
    developerId: string;
    communityId: string;
    createdBy: string;
    status?: 'draft' | 'published' | 'archived';
  }): Promise<string> {
    const id = randomUUID();
    await h.db.query(
      `INSERT INTO projects (id, developer_id, community_id, name_ar, name_en, location, stage,
         ownership_type, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint(55.14, 25.08), 4326)::geography,
         'under_construction', 'freehold', $6, $7, $7)`,
      [
        id,
        input.developerId,
        input.communityId,
        `مشروع ${tag()}`,
        `Fixture Project ${tag()}`,
        input.status ?? 'published',
        input.createdBy,
      ],
    );
    return id;
  }

  /** An active amenity in a new active category (admin's reference data, FR-ADM-04). */
  async function amenity(): Promise<string> {
    const categoryId = randomUUID();
    const id = randomUUID();
    await h.db.query('INSERT INTO amenity_categories (id, name_ar, name_en) VALUES ($1, $2, $3)', [
      categoryId,
      `فئة ${tag()}`,
      `Fixture Category ${tag()}`,
    ]);
    await h.db.query(
      'INSERT INTO amenities (id, category_id, name_ar, name_en) VALUES ($1, $2, $3, $4)',
      [id, categoryId, `مرفق ${tag()}`, `Fixture Amenity ${tag()}`],
    );
    return id;
  }

  /**
   * A media row with no file on disk, licensed unless told otherwise: what publishing counts
   * (FR-DAT-05, BR-14) before the media endpoints exist, and rows the API would refuse.
   */
  async function media(
    projectId: string,
    uploadedBy: string,
    options: {
      type?: 'image' | 'floor_plan' | 'brochure' | 'master_plan' | 'video';
      sourceNote?: string;
      licenseNote?: string;
      displayOrder?: number;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    const type = options.type ?? 'image';
    await h.db.query(
      `INSERT INTO media_files (id, project_id, type, title, file_path, mime_type, size_bytes,
         display_order, source_note, license_note, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 100, $7, $8, $9, $10)`,
      [
        id,
        projectId,
        type,
        `Fixture ${type} ${tag()}`,
        `project-media/${id}.${type === 'image' ? 'png' : type === 'video' ? 'mp4' : 'pdf'}`,
        type === 'image' ? 'image/png' : type === 'video' ? 'video/mp4' : 'application/pdf',
        options.displayOrder ?? 0,
        options.sourceNote ?? 'Own photography',
        options.licenseNote ?? 'Owned by the REIH team',
        uploadedBy,
      ],
    );
    return id;
  }

  /**
   * An item of one of admin's unit reference lists (FR-ADM-04), active unless told otherwise. A
   * layout gets one bedroom.
   */
  async function reference(
    table: 'property_types' | 'layouts' | 'unit_levels' | 'furnishing_types' | 'unit_tags',
    isActive = true,
  ): Promise<string> {
    const id = randomUUID();
    const code = `fx_${tag()}`;
    if (table === 'layouts') {
      await h.db.query(
        `INSERT INTO layouts (id, code, bedrooms, name_ar, name_en, is_active)
         VALUES ($1, $2, 1, $3, $4, $5)`,
        [id, code, `تصميم ${code}`, `Fixture layout ${code}`, isActive],
      );
    } else {
      await h.db.query(
        `INSERT INTO ${table} (id, code, name_ar, name_en, is_active) VALUES ($1, $2, $3, $4, $5)`,
        [id, code, `عنصر ${code}`, `Fixture ${code}`, isActive],
      );
    }
    return id;
  }

  return { developer, emirate, community, project, amenity, media, reference };
}
