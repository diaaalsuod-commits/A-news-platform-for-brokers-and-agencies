import { Injectable } from '@nestjs/common';
import { AdminReadRepository } from '../infrastructure/admin-read.repository.js';

/** FR-ADM-05: display currencies and their exchange rates. */
@Injectable()
export class RatesReader {
  constructor(private readonly repository: AdminReadRepository) {}

  /** FR-ACC-06: true only for a currency that exists and that the Platform Admin enabled. */
  isEnabledCurrency(code: string): Promise<boolean> {
    return this.repository.isEnabledCurrency(code);
  }
}
