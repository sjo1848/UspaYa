import { Module } from '@nestjs/common';

import { CourierDeliveriesController } from './http/courier-deliveries.controller';
import { CourierTransitController } from './http/courier-transit.controller';
import { OperationsDeliveriesController } from './http/operations-deliveries.controller';

@Module({
  controllers: [
    OperationsDeliveriesController,
    CourierDeliveriesController,
    CourierTransitController,
  ],
})
export class DeliveryModule {}
