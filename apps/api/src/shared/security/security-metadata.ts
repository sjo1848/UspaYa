import { SetMetadata } from '@nestjs/common';
import type { RoleCode } from '@uspaya/database';

export const PUBLIC_ROUTE_KEY = 'uspaya.public-route';
export const REQUIRED_ROLES_KEY = 'uspaya.required-roles';

export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
export const Roles = (...roles: readonly RoleCode[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
