import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IdentityController } from './identity.controller';

@Module({
  controllers: [IdentityController, AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class IdentityModule {}
