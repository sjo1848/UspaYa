import type { DomainEvent } from './domain-event';
import { DomainError } from './domain-error';

export type AnyDomainEvent = DomainEvent<string, object>;

export interface TransitionResult<TEvent extends AnyDomainEvent = AnyDomainEvent> {
  readonly changed: boolean;
  readonly version: number;
  readonly event?: TEvent;
}

export function unchanged(version: number): TransitionResult<never> {
  return { changed: false, version };
}

export function changed<TEvent extends AnyDomainEvent>(event: TEvent): TransitionResult<TEvent> {
  return { changed: true, version: event.aggregateVersion, event };
}

export function assertExpectedVersion(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new DomainError('VERSION_CONFLICT', 'The aggregate version is stale.', {
      actualVersion: actual,
      expectedVersion: expected,
    });
  }
}
