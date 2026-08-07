import { Module } from '@nestjs/common';

import { CourierDeliveriesController } from './http/courier-deliveries.controller';
import { OperationsDeliveriesController } from './http/operations-deliveries.controller';

@Module({
  controllers: [OperationsDeliveriesController, CourierDeliveriesController],
})
export class DeliveryModule {}
