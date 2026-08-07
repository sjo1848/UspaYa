import { Module } from '@nestjs/common';

import { OperationsDeliveriesController } from './http/operations-deliveries.controller';

@Module({
  controllers: [OperationsDeliveriesController],
})
export class DeliveryModule {}
