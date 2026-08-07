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

interface PendingCompletionOrderResponse {
  readonly orderId: string;
  readonly version: number;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: 'CONFIRMED';
  readonly deliveryStatus: 'DELIVERED';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

@ApiTags('Operations orders')
@ApiSecurity('developmentActor')
@Controller('operations/orders')
export class OperationsOrdersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('pending-completion')
  @Roles('OPERATIONS')
  @ApiOkResponse({ description: 'Fulfilled orders that satisfy the current completion gate.' })
  async listPendingCompletion(): Promise<readonly PendingCompletionOrderResponse[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        status: 'FULFILLED',
        payment: { status: 'CONFIRMED' },
        delivery: {
          status: 'DELIVERED',
          assignments: { none: { active: true } },
        },
      },
      select: {
        id: true,
        version: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { id: true, name: true } },
        payment: { select: { status: true } },
        delivery: { select: { status: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return orders.map((order) => ({
      orderId: order.id,
      version: order.version,
      branch: order.branch,
      totalCents: order.totalCents,
      currency: order.currency,
      paymentStatus: order.payment?.status as 'CONFIRMED',
      deliveryStatus: order.delivery?.status as 'DELIVERED',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
  }

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
