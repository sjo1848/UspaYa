export interface HealthSnapshot {
  readonly service: 'api';
  readonly status: 'ok';
  readonly timestamp: string;
}

export function createHealthSnapshot(now: Date = new Date()): HealthSnapshot {
  return {
    service: 'api',
    status: 'ok',
    timestamp: now.toISOString(),
  };
}
