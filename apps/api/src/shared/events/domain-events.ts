export class AgencySuspended {
  constructor(readonly agencyId: string) {}
}

export class MemberDeactivated {
  constructor(
    readonly userId: string,
    readonly agencyId: string,
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
