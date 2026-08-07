import {
  MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { HealthController } from './health/health.controller';
import { CatalogModule } from './modules/catalog/catalog.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { DatabaseModule } from './shared/database/database.module';
import { CorrelationIdMiddleware } from './shared/http/correlation-id.middleware';
import { DevelopmentIdentityGuard } from './shared/security/development-identity.guard';
import { RolesGuard } from './shared/security/roles.guard';

@Module({
  imports: [DatabaseModule, IdentityModule, CatalogModule, OrderingModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: DevelopmentIdentityGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
