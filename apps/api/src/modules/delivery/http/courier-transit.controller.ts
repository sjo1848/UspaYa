import {
  Body,
  Controller,
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
import {
  CourierTransitService,
  type CourierTransitTransition,
} from '../application/courier-transit.service';
import { CourierTransitDto } from './courier-transit.dto';

@ApiTags('Courier deliveries')
@ApiSecurity('developmentActor')
@Controller('courier/deliveries')
export class CourierTransitController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post(':deliveryId/start-delivery')
  @HttpCode(HttpStatus.OK)
  @Roles('COURIER')
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiBody({ type: CourierTransitDto })
  @ApiOkResponse({ description: 'Delivery transit started by the assigned courier.' })
  startDelivery(
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
    @Body() body: CourierTransitDto,
    @CurrentActor() actor: RequestActor,
  ) {
    return this.execute(deliveryId, actor, body.expectedVersion, 'START_DELIVERY');
  }

  @Post(':deliveryId/arrive')
  @HttpCode(HttpStatus.OK)
  @Roles('COURIER')
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiBody({ type: CourierTransitDto })
  @ApiOkResponse({ description: 'Arrival at destination reported by the assigned courier.' })
  reportArrival(
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
    @Body() body: CourierTransitDto,
    @CurrentActor() actor: RequestActor,
  ) {
    return this.execute(deliveryId, actor, body.expectedVersion, 'REPORT_ARRIVAL');
  }

  private execute(
    deliveryId: string,
    actor: RequestActor,
    expectedVersion: number,
    transition: CourierTransitTransition,
  ) {
    return new CourierTransitService(this.prisma.client).execute({
      deliveryId,
      actorId: actor.userId,
      expectedVersion,
      transition,
    });
  }
}
