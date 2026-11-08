import type { UserRole } from '@reih/contracts';
import type { Request } from 'express';

/** The logged-in caller. Identity's AuthGuard sets it; shared/http only reads it, to log refusals. */
export interface RequestUser {
  id: string;
  role: UserRole;
  /** Null for staff, who belong to no agency. */
  agencyId: string | null;
  sessionId: string;
}

export type RequestWithUser = Request & { user?: RequestUser };
