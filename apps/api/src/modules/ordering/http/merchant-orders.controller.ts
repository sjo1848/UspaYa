import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';
import {
  MerchantOrderTransitionService,
  type MerchantOrderTransition,
  type MerchantOrderTransitionResult,
} from '../application/merchant-order-transition.service';
import { ExpectedVersionDto } from './expected-version.dto';

@ApiTags('Merchant orders')
@ApiSecurity('developmentActor')
@Controller('orders')
export class MerchantOrdersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post(':orderId/accept')
  @Roles('MERCHANT_OPERATOR')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: ExpectedVersionDto })
  @ApiOkResponse({ description: 'Order accepted by the authorized branch.' })
  accept(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() body: ExpectedVersionDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<MerchantOrderTransitionResult> {
    return this.execute(orderId, body.expectedVersion, actor, 'ACCEPT');
  }

  @Post(':orderId/start-preparation')
  @Roles('MERCHANT_OPERATOR')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: ExpectedVersionDto })
  @ApiOkResponse({ description: 'Order preparation started by the authorized branch.' })
  startPreparation(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() body: ExpectedVersionDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<MerchantOrderTransitionResult> {
    return this.execute(orderId, body.expectedVersion, actor, 'START_PREPARATION');
  }

  @Post(':orderId/ready')
  @Roles('MERCHANT_OPERATOR')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiBody({ type: ExpectedVersionDto })
  @ApiOkResponse({ description: 'Order marked ready by the authorized branch.' })
  markReady(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() body: ExpectedVersionDto,
    @CurrentActor() actor: RequestActor,
  ): Promise<MerchantOrderTransitionResult> {
    return this.execute(orderId, body.expectedVersion, actor, 'MARK_READY');
  }

  private execute(
    orderId: string,
    expectedVersion: number,
    actor: RequestActor,
    transition: MerchantOrderTransition,
  ): Promise<MerchantOrderTransitionResult> {
    return new MerchantOrderTransitionService(this.prisma.client).execute({
      orderId,
      actorId: actor.userId,
      expectedVersion,
      transition,
    });
  }
}
