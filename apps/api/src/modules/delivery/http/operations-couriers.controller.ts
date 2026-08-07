import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../../shared/database/prisma.service';
import { Roles } from '../../../shared/security/security-metadata';

interface AvailableCourierResponse {
  readonly courierId: string;
  readonly displayName: string;
}

@ApiTags('Operations couriers')
@ApiSecurity('developmentActor')
@Controller('operations/couriers')
export class OperationsCouriersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('available')
  @Roles('OPERATIONS')
  @ApiOkResponse({ description: 'Active couriers without an active delivery assignment.' })
  async listAvailable(): Promise<readonly AvailableCourierResponse[]> {
    const couriers = await this.prisma.client.user.findMany({
      where: {
        active: true,
        roleAssignments: { some: { role: 'COURIER' } },
        courierAssignments: { none: { active: true } },
      },
      select: {
        id: true,
        displayName: true,
      },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });

    return couriers.map((courier) => ({
      courierId: courier.id,
      displayName: courier.displayName,
    }));
  }
}
