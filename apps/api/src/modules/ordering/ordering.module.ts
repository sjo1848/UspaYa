import { Module } from '@nestjs/common';

import { PrismaService } from '../../shared/database/prisma.service';
import { SubmitOrderService } from './application/submit-order.service';
import { MerchantOrderReadController } from './http/merchant-order-read.controller';
import { MerchantOrdersController } from './http/merchant-orders.controller';
import { OperationsOrdersController } from './http/operations-orders.controller';
import { OrdersController } from './http/orders.controller';
import { PrismaSubmitOrderPersistence } from './infrastructure/prisma-submit-order.persistence';

@Module({
  controllers: [
    OrdersController,
    MerchantOrderReadController,
    MerchantOrdersController,
    OperationsOrdersController,
  ],
  providers: [
    {
      provide: PrismaSubmitOrderPersistence,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaSubmitOrderPersistence(prisma.client),
    },
    {
      provide: SubmitOrderService,
      inject: [PrismaSubmitOrderPersistence],
      useFactory: (persistence: PrismaSubmitOrderPersistence) =>
        new SubmitOrderService(persistence),
    },
  ],
})
export class OrderingModule {}
