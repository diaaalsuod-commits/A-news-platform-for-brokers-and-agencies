import { Injectable, type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgencySuspended,
  EventBus,
  EventsModule,
  MemberDeactivated,
  OnDomainEvent,
  ProjectPublished,
  ProjectUnpublished,
} from './index.js';

@Injectable()
class Subscriber {
  readonly received: unknown[] = [];
  failing = false;

  @OnDomainEvent(AgencySuspended)
  async onAgencySuspended(event: AgencySuspended): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (this.failing) {
      throw new Error('handler failed');
    }
    this.received.push(event);
  }

  @OnDomainEvent(MemberDeactivated)
  onMemberDeactivated(event: MemberDeactivated): void {
    this.received.push(event);
  }

  @OnDomainEvent(ProjectPublished)
  onProjectPublished(event: ProjectPublished): void {
    this.received.push(event);
  }

  @OnDomainEvent(ProjectUnpublished)
  onProjectUnpublished(event: ProjectUnpublished): void {
    this.received.push(event);
  }
}

describe('EventBus', () => {
  let app: INestApplicationContext;

  const start = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventsModule],
      providers: [Subscriber],
    }).compile();
    app = await moduleRef.init();
    return { bus: app.get(EventBus), subscriber: app.get(Subscriber) };
  };

  afterEach(() => app?.close());

  it('delivers each event to the handler of its own class only', async () => {
    const { bus, subscriber } = await start();
    const events = [
      new MemberDeactivated('user-1', 'agency-1'),
      new ProjectPublished('project-1'),
      new ProjectUnpublished('project-1'),
    ];
    for (const event of events) {
      await bus.publish(event);
    }
    expect(subscriber.received).toEqual(events);
    expect(subscriber.received[1]).toBeInstanceOf(ProjectPublished);
    expect(subscriber.received[2]).toBeInstanceOf(ProjectUnpublished);
  });

  it('waits for an asynchronous handler before publish resolves', async () => {
    const { bus, subscriber } = await start();
    await bus.publish(new AgencySuspended('agency-1'));
    expect(subscriber.received).toEqual([new AgencySuspended('agency-1')]);
  });

  it('passes a handler failure back to the publisher', async () => {
    const { bus, subscriber } = await start();
    subscriber.failing = true;
    await expect(bus.publish(new AgencySuspended('agency-1'))).rejects.toThrow('handler failed');
  });
});
