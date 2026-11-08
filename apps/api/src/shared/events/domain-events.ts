export class AgencySuspended {
  constructor(readonly agencyId: string) {}
}

/** A member or a staff account was deactivated (FR-AGY-04, FR-ADM-03). Staff have no agency. */
export class MemberDeactivated {
  constructor(
    readonly userId: string,
    readonly agencyId: string | null,
  ) {}
}

export class ProjectPublished {
  constructor(readonly projectId: string) {}
}

export class ProjectUnpublished {
  constructor(readonly projectId: string) {}
}

export type DomainEvent =
  AgencySuspended | MemberDeactivated | ProjectPublished | ProjectUnpublished;
