import { Controller, Get, Inject, Res } from '@nestjs/common';

import { PrismaService } from '../shared/database/prisma.service';
import { PublicRoute } from '../shared/security/security-metadata';
import { createHealthSnapshot, type HealthSnapshot } from './health';

interface HealthResponse {
  status(code: number): void;
}

@PublicRoute()
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(@Res({ passthrough: true }) response: HealthResponse): Promise<HealthSnapshot> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return createHealthSnapshot();
    } catch {
      response.status(503);
      return createHealthSnapshot('unavailable');
    }
  }
}
