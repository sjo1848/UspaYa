import { Module } from '@nestjs/common';

import { MerchantOrdersController } from './http/merchant-orders.controller';
import { OrdersController } from './http/orders.controller';

@Module({
  controllers: [OrdersController, MerchantOrdersController],
})
export class OrderingModule {}
