import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import { ApiError } from '../../../shared/http/api-error';
import type { RequestActor } from '../../../shared/http/request-context';
import { CurrentActor } from '../../../shared/security/current-actor.decorator';
import { Roles } from '../../../shared/security/security-metadata';
import { SubmitOrderService } from '../application/submit-order.service';
import { SubmitOrderDto } from './submit-order.dto';

@ApiTags('Orders')
@ApiSecurity('developmentActor')
@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SubmitOrderService) private readonly submitOrderService: SubmitOrderService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('CUSTOMER')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Stable key for one logical order submission.',
  })
  @ApiBody({ type: SubmitOrderDto })
  @ApiCreatedResponse({ description: 'Order submitted and sent to the merchant.' })
  async submitOrder(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: SubmitOrderDto,
    @CurrentActor() actor: RequestActor,
  ) {
    if (idempotencyKey === undefined || idempotencyKey.trim().length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Header Idempotency-Key is required.',
      });
    }

    return this.submitOrderService.execute({
      idempotencyKey,
      orderId: body.orderId,
      deliveryId: body.deliveryId,
      paymentId: body.paymentId,
      customerId: actor.userId,
      branchId: body.branchId,
      plainTextPin: body.deliveryPin,
      deliveryDestination: body.deliveryDestination,
      items: body.items.map((item) => ({
        itemId: item.itemId,
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
  }

  @Get(':orderId')
  @Roles('CUSTOMER', 'MERCHANT_OPERATOR', 'OPERATIONS', 'COURIER')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Order projection authorized for the current actor.' })
  async getOrder(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentActor() actor: RequestActor,
  ) {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      include: {
        branch: { select: { id: true, merchantId: true, name: true } },
        items: { orderBy: { createdAt: 'asc' } },
        payment: true,
        delivery: {
          include: {
            assignments: {
              where: { active: true },
              orderBy: { assignedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (order === null || !canReadOrder(actor, order)) {
      throw new ApiError(HttpStatus.NOT_FOUND, {
        code: 'ORDER_NOT_FOUND',
        message: 'The requested order was not found.',
      });
    }

    return {
      id: order.id,
      status: order.status,
      version: order.version,
      totalCents: order.totalCents,
      currency: order.currency,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      branch: order.branch,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        sku: item.skuSnapshot,
        name: item.nameSnapshot,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
      })),
      payment:
        order.payment === null
          ? null
          : {
              id: order.payment.id,
              method: order.payment.method,
              status: order.payment.status,
              amountCents: order.payment.amountCents,
              version: order.payment.version,
            },
      delivery:
        order.delivery === null
          ? null
          : {
              id: order.delivery.id,
              status: order.delivery.status,
              version: order.delivery.version,
              courierId: order.delivery.assignments[0]?.courierId ?? null,
            },
    };
  }
}

type ReadableOrder = {
  readonly customerId: string;
  readonly branchId: string;
  readonly delivery: null | {
    readonly assignments: readonly { readonly courierId: string }[];
  };
};

function canReadOrder(actor: RequestActor, order: ReadableOrder): boolean {
  if (actor.roles.includes('OPERATIONS')) {
    return true;
  }
  if (actor.roles.includes('CUSTOMER') && order.customerId === actor.userId) {
    return true;
  }
  if (
    actor.roles.includes('MERCHANT_OPERATOR') &&
    actor.scopes.some(
      (scope) => scope.role === 'MERCHANT_OPERATOR' && scope.branchId === order.branchId,
    )
  ) {
    return true;
  }
  return (
    actor.roles.includes('COURIER') &&
    order.delivery?.assignments.some((assignment) => assignment.courierId === actor.userId) === true
  );
}
