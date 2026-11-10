import { randomUUID } from 'node:crypto';
import { Controller, Inject, Module, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DATABASE, DatabaseModule } from '../src/shared/database/index.js';
import { Roles } from '../src/shared/http/index.js';
import { useIdentityApp } from './support/identity-app.js';

const PHONE = '+971501239901';
const WHATSAPP = '+971501239902';
const CONTACT_EMAIL = 'probe.contact@developer.example';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$cHJvYmVzYWx0$cHJvYmUtaGFzaC12YWx1ZQ';

let existingEmail = '';

/** Test-only routes whose queries fail in the database. Registered here, never in AppModule. */
@Controller('probe')
class FailingQueryController {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** A foreign-key violation: the developer does not exist. */
  @Roles('data_operator')
  @Post('contact')
  async contact(): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO sales_contacts (developer_id, full_name, phone, whatsapp, email)
      VALUES (${randomUUID()}, 'Probe Contact', ${PHONE}, ${WHATSAPP}, ${CONTACT_EMAIL})`);
  }

  /** A unique violation, whose detail quotes the email. */
  @Roles('data_operator')
  @Post('user')
  async user(): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO users (email, password_hash, role, status, full_name)
      VALUES (${existingEmail}, ${HASH}, 'data_operator', 'active', 'Probe User')`);
  }
}

@Module({ imports: [DatabaseModule], controllers: [FailingQueryController] })
class FailingQueryModule {}

interface ErrorEntry {
  level: number;
  msg: string;
  err?: { type?: string; message?: string; query?: string; code?: string; constraint?: string };
}

describe('error logs keep personal data out (NFR-08, NFR-11)', () => {
  const h = useIdentityApp({ modules: [FailingQueryModule] });
  let session: string;

  beforeAll(async () => {
    existingEmail = (await h.createUser({ role: 'broker' })).email;
    session = await h.sessionFor((await h.createUser({ role: 'data_operator' })).email);
  });

  const databaseErrors = () =>
    (h.logEntries() as unknown as ErrorEntry[]).filter(
      (entry) => entry.err?.type === 'DatabaseError',
    );

  it('NFR-08 NFR-11 a failed sales contact insert is logged without the phone, WhatsApp number or email', async () => {
    const response = await h.post('/probe/contact', { session });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');

    await vi.waitFor(() =>
      expect(databaseErrors()).toContainEqual(
        expect.objectContaining({
          msg: 'Database query failed',
          err: expect.objectContaining({
            message: 'Database query failed',
            code: '23503',
            constraint: 'sales_contacts_developer_id_fk',
            query: expect.stringContaining('INSERT INTO sales_contacts'),
          }),
        }),
      ),
    );
    const log = h.logLines.join('\n');
    for (const secret of [PHONE, WHATSAPP, CONTACT_EMAIL]) {
      expect(log).not.toContain(secret);
    }
  });

  it('NFR-08 NFR-11 a failed user insert is logged without the email or the password hash', async () => {
    const response = await h.post('/probe/user', { session });
    expect(response.status).toBe(500);

    await vi.waitFor(() =>
      expect(databaseErrors()).toContainEqual(
        expect.objectContaining({
          err: expect.objectContaining({
            code: '23505',
            query: expect.stringContaining('INSERT INTO users'),
          }),
        }),
      ),
    );
    const log = h.logLines.join('\n');
    for (const secret of [existingEmail, HASH, 'already exists', 'params']) {
      expect(log).not.toContain(secret);
    }
  });
});
