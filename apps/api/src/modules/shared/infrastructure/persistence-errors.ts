export class PersistenceConflictError extends Error {
  readonly code = 'PERSISTENCE_VERSION_CONFLICT';

  constructor(entity: string, id: string) {
    super(`${entity} ${id} was modified by another operation.`);
    this.name = 'PersistenceConflictError';
  }
}

export class ActiveCourierAssignmentConflictError extends Error {
  readonly code = 'ACTIVE_COURIER_ASSIGNMENT_CONFLICT';

  constructor() {
    super('Courier or delivery already has an active assignment.');
    this.name = 'ActiveCourierAssignmentConflictError';
  }
}
