import type { MeResponse, UserRole, UserStatus } from '@reih/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../shared/http/index.js';
import type { AgencyStatusPort } from './ports.js';
import type { PasswordHasher } from '../infrastructure/password-hasher.js';
import type { LoginCandidate, UserRepository } from '../infrastructure/user.repository.js';
import { AuthService } from './auth.service.js';
import type { MeService } from './me.service.js';
import type { SessionService } from './session.service.js';

const AGENCY_ID = '00000000-0000-4000-8000-000000000001';

function candidate(overrides: Partial<LoginCandidate> = {}): LoginCandidate {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    passwordHash: '$argon2id$stored',
    role: 'broker' as UserRole,
    status: 'active' as UserStatus,
    agencyId: AGENCY_ID,
    lockedUntil: null,
    prefLanguage: 'en',
    ...overrides,
  };
}

/** AuthService with in-memory stand-ins: the rule is tested without a database. */
function service(options: {
  user: LoginCandidate | null;
  passwordValid?: boolean;
  agencyActive?: boolean;
}) {
  const start = vi.fn(async () => 'new-token');
  const auth = new AuthService(
    {
      findByEmail: async () => options.user,
      recordFailedLogin: vi.fn(async () => undefined),
      recordLogin: vi.fn(async () => undefined),
    } as unknown as UserRepository,
    {
      verify: async () => options.passwordValid ?? true,
      verifyNothing: async () => undefined,
    } as unknown as PasswordHasher,
    { isActive: async () => options.agencyActive ?? true } as unknown as AgencyStatusPort,
    { start, end: vi.fn(async () => undefined) } as unknown as SessionService,
    { get: async () => ({}) as MeResponse } as unknown as MeService,
  );
  return { auth, start };
}

const attempt = (auth: AuthService) =>
  auth
    .login(
      { email: 'someone@example.test', password: 'a-long-password' },
      { ipAddress: null, userAgent: null, previousToken: undefined },
    )
    .then(
      () => 'accepted',
      (error: unknown) => error,
    );

describe('AuthService.login', () => {
  it('FR-ACC-02 one generic error for every refusal, including an agency role without an agency', async () => {
    const refusals = {
      unknownEmail: service({ user: null }),
      wrongPassword: service({ user: candidate(), passwordValid: false }),
      noPassword: service({ user: candidate({ passwordHash: null }) }),
      locked: service({ user: candidate({ lockedUntil: new Date(Date.now() + 60_000) }) }),
      deactivated: service({ user: candidate({ status: 'deactivated' }) }),
      invited: service({ user: candidate({ status: 'invited' }) }),
      suspendedAgency: service({ user: candidate(), agencyActive: false }),
      // The users_check constraint forbids this row in the database; the code refuses it anyway.
      brokerWithoutAgency: service({ user: candidate({ agencyId: null }) }),
      agencyAdminWithoutAgency: service({
        user: candidate({ role: 'agency_admin', agencyId: null }),
      }),
    };

    for (const [name, { auth, start }] of Object.entries(refusals)) {
      const result = await attempt(auth);
      expect(result, name).toBeInstanceOf(AppError);
      expect(result, name).toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401, details: {} });
      expect(start, name).not.toHaveBeenCalled();
    }
  });

  it('BR-13 staff log in without an agency, agency members only with an active one', async () => {
    const staff = service({ user: candidate({ role: 'data_operator', agencyId: null }) });
    expect(await attempt(staff.auth)).toBe('accepted');

    const member = service({ user: candidate(), agencyActive: true });
    expect(await attempt(member.auth)).toBe('accepted');
    expect(member.start).toHaveBeenCalledOnce();
  });
});
