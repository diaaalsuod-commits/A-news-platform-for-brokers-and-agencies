import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { agencies } from './agency.schema.js';

export interface AgencyRow {
  id: string;
  nameAr: string;
  nameEn: string;
  status: 'active' | 'suspended';
}

@Injectable()
export class AgencyRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async findById(agencyId: string): Promise<AgencyRow | null> {
    const [row] = await this.db
      .select({
        id: agencies.id,
        nameAr: agencies.nameAr,
        nameEn: agencies.nameEn,
        status: agencies.status,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    return row ?? null;
  }
}
