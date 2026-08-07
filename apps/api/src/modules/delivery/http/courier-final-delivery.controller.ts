import {
  Body,
  Controller,
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
import { ConfirmDeliveryService } from '../application/confirm-delivery.service';
import { ConfirmDeliveryDto } from './confirm-delivery.dto';

@ApiTags('Courier deliveries')
@ApiSecurity('developmentActor')
@Controller('courier/deliveries')
export class CourierFinalDeliveryController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post(':deliveryId/confirm-delivery')
  @HttpCode(HttpStatus.OK)
  @Roles('COURIER')
  @ApiParam({ name: 'deliveryId', format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Stable key for one logical final-delivery confirmation.',
  })
  @ApiBody({ type: ConfirmDeliveryDto })
  @ApiOkResponse({
    description:
      'Delivery, cash payment, order fulfillment and courier release confirmed atomically.',
  })
  confirmDelivery(
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' })) deliveryId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ConfirmDeliveryDto,
    @CurrentActor() actor: RequestActor,
  ) {
    if (idempotencyKey === undefined || idempotencyKey.trim().length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Header Idempotency-Key is required.',
      });
    }
    if (idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128) {
      throw new ApiError(HttpStatus.BAD_REQUEST, {
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Header Idempotency-Key must contain 8 to 128 characters.',
      });
    }

    return new ConfirmDeliveryService(this.prisma.client).execute({
      idempotencyKey,
      deliveryId,
      actorId: actor.userId,
      expectedVersion: body.expectedVersion,
      pin: body.pin,
      receiver: body.receiver,
      cashReceivedCents: body.cashReceivedCents,
    });
  }
}
