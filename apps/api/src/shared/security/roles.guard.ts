import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleCode } from '@uspaya/database';

import { ApiError } from '../http/api-error';
import type { UspaYaRequest } from '../http/request-context';
import { PUBLIC_ROUTE_KEY, REQUIRED_ROLES_KEY } from './security-metadata';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<readonly RoleCode[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined || requiredRoles.length === 0) {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, {
        code: 'ROUTE_AUTHORIZATION_NOT_CONFIGURED',
        message: 'The endpoint does not declare an authorization policy.',
      });
    }

    const request = context.switchToHttp().getRequest<UspaYaRequest>();
    const actor = request.actor;
    if (actor === undefined) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required for this endpoint.',
      });
    }

    if (!requiredRoles.some((role) => actor.roles.includes(role))) {
      throw new ApiError(HttpStatus.FORBIDDEN, {
        code: 'ROLE_FORBIDDEN',
        message: 'The current actor is not allowed to perform this operation.',
      });
    }
    return true;
  }
}
