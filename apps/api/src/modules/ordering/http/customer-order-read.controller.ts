import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';

const CUSTOMER_ACTIVE_ORDER_STATUSES = [
  'SUBMITTED',
  'PENDING_MERCHANT',
  'CHANGE_PROPOSED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'FULFILLED',
  'CANCELLATION_REQUESTED',
] as const;

type CustomerActiveOrderStatus = (typeof CUSTOMER_ACTIVE_ORDER_STATUSES)[number];

interface CustomerActiveOrderResponse {
  readonly orderId: string;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly status: CustomerActiveOrderStatus;
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: string | null;
  readonly deliveryStatus: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

@ApiTags('Customer orders')
@ApiSecurity('developmentActor')
@Controller('customer/orders')
export class CustomerOrderReadController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('active')
  @Roles('CUSTOMER')
  @ApiOkResponse({ description: 'Active orders owned by the current customer.' })
  async listActive(
    @CurrentActor() actor: RequestActor,
  ): Promise<readonly CustomerActiveOrderResponse[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        customerId: actor.userId,
        status: { in: [...CUSTOMER_ACTIVE_ORDER_STATUSES] },
      },
      select: {
        id: true,
        status: true,
        version: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { id: true, name: true } },
        payment: { select: { status: true } },
        delivery: { select: { status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return orders.map((order) => ({
      orderId: order.id,
      branch: order.branch,
      status: order.status as CustomerActiveOrderStatus,
      version: order.version,
      totalCents: order.totalCents,
      currency: order.currency,
      paymentStatus: order.payment?.status ?? null,
      deliveryStatus: order.delivery?.status ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
  }
}
