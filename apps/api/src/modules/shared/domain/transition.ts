import type { DomainEvent } from './domain-event';
import { DomainError } from './domain-error';

export interface TransitionResult<TEvent extends DomainEvent = DomainEvent> {
  readonly changed: boolean;
  readonly version: number;
  readonly event?: TEvent;
}

export function unchanged<TEvent extends DomainEvent = DomainEvent>(
  version: number,
): TransitionResult<TEvent> {
  return { changed: false, version };
}

export function changed<TEvent extends DomainEvent>(event: TEvent): TransitionResult<TEvent> {
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
