import { Controller, Get } from '@nestjs/common';

import { PublicRoute } from '../shared/security/security-metadata';
import { createHealthSnapshot, type HealthSnapshot } from './health';

@PublicRoute()
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthSnapshot {
    return createHealthSnapshot();
  }
}
