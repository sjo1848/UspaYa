import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../database/prisma.service';
import { ApiError } from '../http/api-error';
import type { UspaYaRequest } from '../http/request-context';
import { PUBLIC_ROUTE_KEY } from './security-metadata';

const ALLOWED_ENVIRONMENTS = new Set(['development', 'test']);

@Injectable()
export class DevelopmentIdentityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    if (!isDevelopmentIdentityEnabled()) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required for this endpoint.',
      });
    }

    const request = context.switchToHttp().getRequest<UspaYaRequest>();
    const actorId = readHeader(request.headers['x-dev-actor-id']);
    if (actorId === undefined) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, {
        code: 'DEVELOPMENT_ACTOR_REQUIRED',
        message: 'Header x-dev-actor-id is required in an authorized development environment.',
      });
    }

    const user = await this.prisma.client.user.findFirst({
      where: { id: actorId, active: true },
      include: { roleAssignments: true },
    });
    if (user === null || user.roleAssignments.length === 0) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, {
        code: 'INVALID_DEVELOPMENT_ACTOR',
        message: 'The selected development actor is not active.',
      });
    }

    request.actor = {
      userId: user.id,
      displayName: user.displayName,
      roles: user.roleAssignments.map((assignment) => assignment.role),
      scopes: user.roleAssignments.map((assignment) => ({
        ...(assignment.merchantId === null ? {} : { merchantId: assignment.merchantId }),
        ...(assignment.branchId === null ? {} : { branchId: assignment.branchId }),
      })),
    };
    return true;
  }
}

export function assertDevelopmentIdentityConfiguration(): void {
  if (process.env.DEV_IDENTITY_ENABLED !== 'true') {
    return;
  }
  const environment = process.env.NODE_ENV;
  if (environment === undefined || !ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error(
      `DEV_IDENTITY_ENABLED cannot be true when NODE_ENV is ${environment ?? 'undefined'}.`,
    );
  }
}

export function isDevelopmentIdentityEnabled(): boolean {
  const environment = process.env.NODE_ENV;
  return (
    process.env.DEV_IDENTITY_ENABLED === 'true' &&
    environment !== undefined &&
    ALLOWED_ENVIRONMENTS.has(environment)
  );
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
