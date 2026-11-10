import { randomUUID } from 'node:crypto';
import type { useIdentityApp } from './identity-app.js';

type App = ReturnType<typeof useIdentityApp>;

/**
 * Rows the content tests need before their own endpoint exists (projects come in P4.2), written
 * straight to the test database.
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

  return { developer, emirate, community, project };
}
