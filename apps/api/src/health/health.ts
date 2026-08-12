export interface HealthSnapshot {
  readonly service: 'api';
  readonly status: 'ok' | 'unavailable';
  readonly database: 'ok' | 'unavailable';
  readonly timestamp: string;
}

export function createHealthSnapshot(
  database: HealthSnapshot['database'] = 'ok',
  now: Date = new Date(),
): HealthSnapshot {
  return {
    service: 'api',
    status: database === 'ok' ? 'ok' : 'unavailable',
    database,
    timestamp: now.toISOString(),
  };
}
