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
import {
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';
import { AssignCourierService } from '../application/assign-courier.service';
import { AssignCourierDto } from './assign-courier.dto';

@ApiTags('Operations deliveries')
@ApiSecurity('developmentActor')
@Controller('operations/deliveries')
export class OperationsDeliveriesController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('unassigned')
  @Roles('OPERATIONS')
  @ApiOkResponse({ description: 'READY deliveries waiting for manual courier assignment.' })
  async listUnassigned() {
    const deliveries = await this.prisma.client.delivery.findMany({
      where: {
        status: 'PENDING_ASSIGNMENT',
        order: { status: 'READY' },
      },
      include: {
        order: {
          select: {
            id: true,
            totalCents: true,
            createdAt: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return {
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        orderId: delivery.order.id,
        status: delivery.status,
        version: delivery.version,
        expectedCashCents: delivery.expectedCashCents,
        orderTotalCents: delivery.order.totalCents,
        orderCreatedAt: delivery.order.createdAt,
        branch: delivery.order.branch,
      })),
    };
  }

  @Post(':deliveryId/assign')
  @HttpCode(HttpStatus.OK)
  @Roles('OPERATIONS')
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiBody({ type: AssignCourierDto })
  @ApiOkResponse({ description: 'Courier assigned manually by operations.' })
  assignCourier(
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
    @Body() body: AssignCourierDto,
    @CurrentActor() actor: RequestActor,
  ) {
    return new AssignCourierService(this.prisma.client).execute({
      deliveryId,
      courierId: body.courierId,
      actorId: actor.userId,
      expectedVersion: body.expectedVersion,
    });
  }
}
