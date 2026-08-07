import { Module } from '@nestjs/common';

import { MerchantOrdersController } from './http/merchant-orders.controller';
import { OperationsOrdersController } from './http/operations-orders.controller';
import { OrdersController } from './http/orders.controller';

@Module({
  controllers: [OrdersController, MerchantOrdersController, OperationsOrdersController],
})
export class OrderingModule {}
