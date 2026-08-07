import { Module } from '@nestjs/common';

import { OrdersController } from './http/orders.controller';

@Module({
  controllers: [OrdersController],
})
export class OrderingModule {}
