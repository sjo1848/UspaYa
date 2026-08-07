export type DomainErrorCode =
  'INVALID_VALUE' | 'INVALID_STATE' | 'VERSION_CONFLICT' | 'FORBIDDEN' | 'BUSINESS_RULE_VIOLATION';

export type DomainErrorContext = Readonly<Record<string, string | number | boolean>>;

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly context: DomainErrorContext;

  constructor(code: DomainErrorCode, message: string, context: DomainErrorContext = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.context = context;
  }
}
