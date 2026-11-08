import { Injectable, Logger } from '@nestjs/common';
import { AgencySuspended, MemberDeactivated, OnDomainEvent } from '../../../shared/events/index.js';
import { SessionService } from './session.service.js';

/** Ends the affected sessions at once (FR-ADM-02, FR-AGY-04, BR-13). */
@Injectable()
export class SessionTerminationListener {
  private readonly logger = new Logger(SessionTerminationListener.name);

  constructor(private readonly sessions: SessionService) {}

  @OnDomainEvent(AgencySuspended)
  async onAgencySuspended(event: AgencySuspended): Promise<void> {
    const ended = await this.sessions.endAllForAgency(event.agencyId);
    this.logger.log({ msg: 'Sessions ended: agency suspended', agencyId: event.agencyId, ended });
  }

  @OnDomainEvent(MemberDeactivated)
  async onMemberDeactivated(event: MemberDeactivated): Promise<void> {
    const ended = await this.sessions.endAllForUser(event.userId);
    this.logger.log({ msg: 'Sessions ended: member deactivated', userId: event.userId, ended });
  }
}
