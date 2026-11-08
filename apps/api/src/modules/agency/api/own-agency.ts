import { HttpStatus } from '@nestjs/common';
import { AppError, type RequestUser } from '../../../shared/http/index.js';

/**
 * NFR-09: the caller's own agency, from the session. No agency route takes an agency id, so an
 * Agency Admin or a Broker can never reach another agency's branding, members or invitations.
 */
export function ownAgency(user: RequestUser): string {
  if (user.agencyId === null) {
    throw new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);
  }
  return user.agencyId;
}
