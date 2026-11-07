import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { DomainEvent } from './domain-events.js';

type DomainEventClass<T extends DomainEvent> = new (...args: never[]) => T;

@Injectable()
export class EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  /** Resolves once every handler has finished, and rejects if one of them fails. */
  async publish(event: DomainEvent): Promise<void> {
    await this.emitter.emitAsync(event.constructor.name, event);
  }
}

/**
 * Subscribes a method to one event. Use this and not @OnEvent, which by default logs a handler's
 * error and hides it from publish(). A side effect such as ending sessions must not fail silently.
 */
export const OnDomainEvent = <T extends DomainEvent>(eventClass: DomainEventClass<T>) =>
  OnEvent(eventClass.name, { suppressErrors: false });
