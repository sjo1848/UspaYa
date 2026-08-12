import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthService } from '../../modules/identity/auth.service';
import { ApiError } from '../http/api-error';
import type { UspaYaRequest } from '../http/request-context';
import { PUBLIC_ROUTE_KEY } from './security-metadata';
import {
  DevelopmentIdentityGuard,
  isDevelopmentIdentityEnabled,
} from './development-identity.guard';

@Injectable()
export class InternalIdentityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DevelopmentIdentityGuard)
    private readonly developmentIdentity: DevelopmentIdentityGuard,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    if (isDevelopmentIdentityEnabled()) {
      return this.developmentIdentity.canActivate(context);
    }

    const request = context.switchToHttp().getRequest<UspaYaRequest>();
    const token = readBearer(request.headers.authorization);
    if (token === undefined) {
      throw authenticationRequired();
    }
    request.actor = await this.auth.actorFromAccessToken(token);
    return true;
  }
}

function readBearer(value: string | string[] | undefined): string | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  if (header === undefined) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match?.[1];
}

function authenticationRequired(): ApiError {
  return new ApiError(HttpStatus.UNAUTHORIZED, {
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication is required for this endpoint.',
  });
}
