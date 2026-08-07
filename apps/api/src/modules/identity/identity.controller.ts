import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { RoleCode } from '@uspaya/database';

import type { RequestActorScope } from '../../shared/http/request-context';
import { CurrentActor } from '../../shared/security/current-actor.decorator';
import { Roles } from '../../shared/security/security-metadata';
import type { RequestActor } from '../../shared/http/request-context';

interface CurrentActorResponse {
  readonly userId: string;
  readonly displayName: string;
  readonly roles: readonly RoleCode[];
  readonly scopes: readonly RequestActorScope[];
}

@ApiTags('Development identity')
@ApiSecurity('developmentActor')
@Controller('actors')
export class IdentityController {
  @Get('me')
  @Roles('CUSTOMER', 'MERCHANT_OPERATOR', 'OPERATIONS', 'COURIER')
  @ApiOkResponse({ description: 'Current seeded actor and authorized scopes.' })
  getCurrentActor(@CurrentActor() actor: RequestActor): CurrentActorResponse {
    return actor;
  }
}
