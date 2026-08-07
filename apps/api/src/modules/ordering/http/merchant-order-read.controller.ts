import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';

const MERCHANT_INBOX_STATUSES = ['PENDING_MERCHANT', 'ACCEPTED', 'PREPARING', 'READY'] as const;

type MerchantInboxOrderStatus = (typeof MERCHANT_INBOX_STATUSES)[number];

interface MerchantInboxOrderResponse {
  readonly orderId: string;
  readonly branch: {
    readonly id: string;
    readonly name: string;
  };
  readonly status: MerchantInboxOrderStatus;
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly paymentStatus: string | null;
  readonly deliveryStatus: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

@ApiTags('Merchant orders')
@ApiSecurity('developmentActor')
@Controller('merchant/orders')
export class MerchantOrderReadController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Roles('MERCHANT_OPERATOR')
  @ApiOkResponse({ description: 'Open merchant inbox scoped to the actor authorized branches.' })
  async listInbox(
    @CurrentActor() actor: RequestActor,
  ): Promise<readonly MerchantInboxOrderResponse[]> {
    const branchIds = [
      ...new Set(
        actor.scopes.flatMap((scope) =>
          scope.role === 'MERCHANT_OPERATOR' && scope.branchId !== undefined
            ? [scope.branchId]
            : [],
        ),
      ),
    ];

    if (branchIds.length === 0) {
      return [];
    }

    const orders = await this.prisma.client.order.findMany({
      where: {
        branchId: { in: branchIds },
        status: { in: [...MERCHANT_INBOX_STATUSES] },
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
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return orders.map((order) => ({
      orderId: order.id,
      branch: order.branch,
      status: order.status as MerchantInboxOrderStatus,
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
