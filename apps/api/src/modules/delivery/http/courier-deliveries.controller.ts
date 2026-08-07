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
import {
  CourierPickupService,
  type CourierPickupTransition,
} from '../application/courier-pickup.service';
import { DeliveryNotFoundError } from '../application/assign-courier.service';
import { ConfirmPickupDto, StartPickupDto } from './courier-pickup.dto';

@ApiTags('Courier deliveries')
@ApiSecurity('developmentActor')
@Controller('courier/deliveries')
export class CourierDeliveriesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('active')
  @Roles('COURIER')
  @ApiOkResponse({ description: 'Current active delivery assigned to the courier.' })
  async getActive(@CurrentActor() actor: RequestActor) {
    const delivery = await this.prisma.client.delivery.findFirst({
      where: {
        assignments: {
          some: {
            courierId: actor.userId,
            active: true,
          },
        },
      },
      include: {
        assignments: {
          where: {
            courierId: actor.userId,
            active: true,
          },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
        order: {
          select: {
            id: true,
            status: true,
            totalCents: true,
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (delivery === null) {
      throw new DeliveryNotFoundError();
    }

    return {
      delivery: {
        id: delivery.id,
        orderId: delivery.order.id,
        status: delivery.status,
        version: delivery.version,
        expectedCashCents: delivery.expectedCashCents,
        orderStatus: delivery.order.status,
        orderTotalCents: delivery.order.totalCents,
        branch: delivery.order.branch,
        assignedAt: delivery.assignments[0]?.assignedAt,
      },
    };
  }

  @Post(':deliveryId/start-pickup')
  @HttpCode(HttpStatus.OK)
  @Roles('COURIER')
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiBody({ type: StartPickupDto })
  @ApiOkResponse({ description: 'Pickup started by the assigned courier.' })
  startPickup(
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
    @Body() body: StartPickupDto,
    @CurrentActor() actor: RequestActor,
  ) {
    return this.execute(deliveryId, actor, body.expectedVersion, 'START_PICKUP');
  }

  @Post(':deliveryId/confirm-pickup')
  @HttpCode(HttpStatus.OK)
  @Roles('COURIER')
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiBody({ type: ConfirmPickupDto })
  @ApiOkResponse({ description: 'Pickup and custody transfer confirmed by the assigned courier.' })
  confirmPickup(
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
    @Body() body: ConfirmPickupDto,
    @CurrentActor() actor: RequestActor,
  ) {
    return new CourierPickupService(this.prisma.client).execute({
      deliveryId,
      actorId: actor.userId,
      expectedVersion: body.expectedVersion,
      transition: 'CONFIRM_PICKUP',
      merchantResponsible: body.merchantResponsible,
      packageCount: body.packageCount,
    });
  }

  private execute(
    deliveryId: string,
    actor: RequestActor,
    expectedVersion: number,
    transition: CourierPickupTransition,
  ) {
    return new CourierPickupService(this.prisma.client).execute({
      deliveryId,
      actorId: actor.userId,
      expectedVersion,
      transition,
    });
  }
}
