import { Controller, Get } from '@nestjs/common';

import { createHealthSnapshot, type HealthSnapshot } from './health';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthSnapshot {
    return createHealthSnapshot();
  }
}
