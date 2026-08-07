export type DevelopmentActorKind = 'customer' | 'merchant' | 'operations' | 'courier';

export interface DevelopmentActorOption {
  readonly kind: DevelopmentActorKind;
  readonly label: string;
  readonly id: string;
}

export const DEVELOPMENT_ACTORS: readonly DevelopmentActorOption[] = Object.freeze([
  {
    kind: 'customer',
    label: 'Cliente',
    id: '11111111-1111-4111-8111-111111111111',
  },
  {
    kind: 'merchant',
    label: 'Comercio',
    id: '22222222-2222-4222-8222-222222222222',
  },
  {
    kind: 'operations',
    label: 'Operaciones',
    id: '33333333-3333-4333-8333-333333333333',
  },
  {
    kind: 'courier',
    label: 'Repartidor',
    id: '44444444-4444-4444-8444-444444444444',
  },
]);

export function findDevelopmentActor(actorId: string): DevelopmentActorOption | undefined {
  return DEVELOPMENT_ACTORS.find((actor) => actor.id === actorId);
}
