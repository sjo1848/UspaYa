import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';

const ACTIONABLE_STATUSES = ['PENDING_MERCHANT', 'ACCEPTED', 'PREPARING'] as const;

interface MerchantActionableOrderResponse {
  readonly orderId: string;
  readonly branchId: string;
  readonly status: (typeof ACTIONABLE_STATUSES)[number];
  readonly version: number;
  readonly totalCents: number;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

@ApiTags('Merchant orders')
@ApiSecurity('developmentActor')
@Controller('merchant/orders')
export class MerchantOrderReadController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('actionable')
  @Roles('MERCHANT_OPERATOR')
  @ApiOkResponse({ description: 'Actionable orders scoped to the merchant operator branches.' })
  async listActionable(
    @CurrentActor() actor: RequestActor,
  ): Promise<readonly MerchantActionableOrderResponse[]> {
    const branchIds = [
      ...new Set(
        actor.scopes.flatMap((scope) => (scope.branchId === undefined ? [] : [scope.branchId])),
      ),
    ];

    if (branchIds.length === 0) {
      return [];
    }

    const orders = await this.prisma.client.order.findMany({
      where: {
        branchId: { in: branchIds },
        status: { in: [...ACTIONABLE_STATUSES] },
      },
      select: {
        id: true,
        branchId: true,
        status: true,
        version: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return orders.map((order) => ({
      orderId: order.id,
      branchId: order.branchId,
      status: order.status as MerchantActionableOrderResponse['status'],
      version: order.version,
      totalCents: order.totalCents,
      currency: order.currency,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));
  }
}
