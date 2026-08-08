import { DomainError } from '../../shared/domain/domain-error';

export interface DeliveryDestinationInput {
  readonly addressText: string;
  readonly phone: string;
  readonly reference?: string;
  readonly lodging?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface DeliveryDestinationSnapshot {
  readonly addressText: string;
  readonly phone: string;
  readonly reference: string | null;
  readonly lodging: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export class DeliveryDestination {
  private constructor(private readonly snapshot: DeliveryDestinationSnapshot) {}

  static create(input: DeliveryDestinationInput): DeliveryDestination {
    const addressText = requiredText(input.addressText, 'Delivery address', 3, 240);
    const phone = requiredText(input.phone, 'Delivery phone', 6, 32);
    const reference = optionalText(input.reference, 'Delivery reference', 240);
    const lodging = optionalText(input.lodging, 'Delivery lodging', 160);
    const hasLatitude = input.latitude !== undefined;
    const hasLongitude = input.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new DomainError(
        'INVALID_VALUE',
        'Delivery coordinates must include latitude and longitude together.',
      );
    }

    const latitude = hasLatitude ? coordinate(input.latitude, -90, 90, 'latitude') : null;
    const longitude = hasLongitude ? coordinate(input.longitude, -180, 180, 'longitude') : null;

    return new DeliveryDestination(
      Object.freeze({
        addressText,
        phone,
        reference,
        lodging,
        latitude,
        longitude,
      }),
    );
  }

  toSnapshot(): DeliveryDestinationSnapshot {
    return this.snapshot;
  }
}

function requiredText(value: string, label: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new DomainError('INVALID_VALUE', `${label} must contain ${min} to ${max} characters.`);
  }
  return normalized;
}

function optionalText(value: string | undefined, label: string, max: number): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > max) {
    throw new DomainError('INVALID_VALUE', `${label} must contain at most ${max} characters.`);
  }
  return normalized;
}

function coordinate(value: number | undefined, min: number, max: number, label: string): number {
  if (value === undefined || !Number.isFinite(value) || value < min || value > max) {
    throw new DomainError('INVALID_VALUE', `Delivery ${label} is outside the supported range.`);
  }
  return value;
}
