import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';
import { CompleteOrderService } from '../application/complete-order.service';
import { OrderAuditQueryService } from '../application/order-audit-query.service';
import { ExpectedVersionDto } from './expected-version.dto';

@ApiTags('Operations orders')
@ApiSecurity('developmentActor')
@Controller('operations/orders')
export class OperationsOrdersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(':orderId/audit')
  @Roles('OPERATIONS')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Sanitized audit trail for one order and its linked aggregates.' })
  audit(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentActor() actor: RequestActor,
  ) {
    return new OrderAuditQueryService(this.prisma.client).execute(orderId, actor.userId);
  }

  @Post(':orderId/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('OPERATIONS')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: ExpectedVersionDto })
  @ApiOkResponse({ description: 'Fulfilled order closed after delivery and payment checks.' })
  complete(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() body: ExpectedVersionDto,
    @CurrentActor() actor: RequestActor,
  ) {
    return new CompleteOrderService(this.prisma.client).execute({
      orderId,
      actorId: actor.userId,
      expectedVersion: body.expectedVersion,
    });
  }
}
