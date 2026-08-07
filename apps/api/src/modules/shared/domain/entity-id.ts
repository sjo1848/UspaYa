import { DomainError } from './domain-error';

export class EntityId {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static of(value: string, field = 'id'): EntityId {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new DomainError('INVALID_VALUE', `${field} must not be empty.`, { field });
    }

    return new EntityId(normalized);
  }

  equals(other: EntityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
