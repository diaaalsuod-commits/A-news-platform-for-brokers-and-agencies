import { Inject, Injectable } from '@nestjs/common';
import type { LangCode, UserRole } from '@reih/contracts';
import { ENV, type Env } from '../../../shared/config/index.js';
import { isAgencyRole } from '../domain/roles.js';

/**
 * Links in invitation and reset emails. Agency members use the Broker Web App and staff the
 * Operations Dashboard. The token goes after #, which browsers never send to a server, so it stays
 * out of every access log on the way.
 */
@Injectable()
export class AccountLinks {
  constructor(@Inject(ENV) private readonly env: Env) {}

  activation(role: UserRole, language: LangCode, token: string): string {
    return this.build(role, language, 'activate', token);
  }

  passwordReset(role: UserRole, language: LangCode, token: string): string {
    return this.build(role, language, 'reset-password', token);
  }

  private build(role: UserRole, language: LangCode, page: string, token: string): string {
    const base = (isAgencyRole(role) ? this.env.APP_URL : this.env.OPS_URL).replace(/\/+$/, '');
    return `${base}/${language}/${page}#token=${token}`;
  }
}
