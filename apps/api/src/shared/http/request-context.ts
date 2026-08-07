import type { RoleCode } from '@uspaya/database';

export interface RequestActorScope {
  readonly role: RoleCode;
  readonly merchantId?: string;
  readonly branchId?: string;
}

export interface RequestActor {
  readonly userId: string;
  readonly displayName: string;
  readonly roles: readonly RoleCode[];
  readonly scopes: readonly RequestActorScope[];
}

export interface UspaYaRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
  actor?: RequestActor;
}
