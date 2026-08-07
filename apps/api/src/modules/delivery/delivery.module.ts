import { Module } from '@nestjs/common';

import { CourierDeliveriesController } from './http/courier-deliveries.controller';
import { CourierFinalDeliveryController } from './http/courier-final-delivery.controller';
import { CourierTransitController } from './http/courier-transit.controller';
import { OperationsCouriersController } from './http/operations-couriers.controller';
import { OperationsDeliveriesController } from './http/operations-deliveries.controller';

@Module({
  controllers: [
    OperationsDeliveriesController,
    OperationsCouriersController,
    CourierDeliveriesController,
    CourierTransitController,
    CourierFinalDeliveryController,
  ],
})
export class DeliveryModule {}
