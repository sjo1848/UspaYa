export interface WorkerHealthSnapshot {
  readonly service: 'worker';
  readonly status: 'ready';
  readonly broker: 'not-configured';
  readonly timestamp: string;
}

export function createWorkerHealthSnapshot(now: Date = new Date()): WorkerHealthSnapshot {
  return {
    service: 'worker',
    status: 'ready',
    broker: 'not-configured',
    timestamp: now.toISOString(),
  };
}
