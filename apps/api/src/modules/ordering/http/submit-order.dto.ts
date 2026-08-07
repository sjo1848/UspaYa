import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitOrderItemDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated operation item identifier.' })
  @IsUUID('4')
  itemId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class SubmitOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Client-generated order identifier.' })
  @IsUUID('4')
  orderId!: string;

  @ApiProperty({ format: 'uuid', description: 'Client-generated delivery identifier.' })
  @IsUUID('4')
  deliveryId!: string;

  @ApiProperty({ format: 'uuid', description: 'Client-generated payment identifier.' })
  @IsUUID('4')
  paymentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ pattern: '^\\d{4,6}$', writeOnly: true })
  @Matches(/^\d{4,6}$/)
  deliveryPin!: string;

  @ApiProperty({ type: [SubmitOrderItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((item: SubmitOrderItemDto) => item.itemId)
  @ValidateNested({ each: true })
  @Type(() => SubmitOrderItemDto)
  items!: SubmitOrderItemDto[];
}
