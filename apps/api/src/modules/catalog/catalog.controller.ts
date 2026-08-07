import { Controller, Get, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../shared/database/prisma.service';
import { ApiError } from '../../shared/http/api-error';
import { Roles } from '../../shared/security/security-metadata';

interface CatalogProductResponse {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: 'ARS';
}

interface BranchCatalogResponse {
  readonly branch: {
    readonly id: string;
    readonly merchantId: string;
    readonly name: string;
  };
  readonly products: readonly CatalogProductResponse[];
}

@ApiTags('Catalog')
@ApiSecurity('developmentActor')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('branches/:branchId/products')
  @Roles('CUSTOMER', 'MERCHANT_OPERATOR', 'OPERATIONS')
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOkResponse({ description: 'Active products for one active branch.' })
  async getBranchProducts(
    @Param('branchId', new ParseUUIDPipe({ version: '4' })) branchId: string,
  ): Promise<BranchCatalogResponse> {
    const branch = await this.prisma.client.branch.findFirst({
      where: { id: branchId, active: true, merchant: { active: true } },
      include: {
        products: {
          where: { active: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (branch === null) {
      throw new ApiError(HttpStatus.NOT_FOUND, {
        code: 'CATALOG_NOT_FOUND',
        message: 'The requested catalog was not found.',
      });
    }

    return {
      branch: {
        id: branch.id,
        merchantId: branch.merchantId,
        name: branch.name,
      },
      products: branch.products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        priceCents: product.priceCents,
        currency: 'ARS',
      })),
    };
  }
}
