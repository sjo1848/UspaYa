import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class DeliveryDestinationDto {
  @ApiProperty({ description: 'Frozen textual delivery address.', maxLength: 240 })
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  addressText!: string;

  @ApiProperty({ description: 'Delivery contact phone for the active courier.', maxLength: 32 })
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional({ description: 'Optional delivery reference.', maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reference?: string;

  @ApiPropertyOptional({ description: 'Optional lodging or accommodation name.', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  lodging?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @ValidateIf(
    (destination: DeliveryDestinationDto) =>
      destination.latitude !== undefined || destination.longitude !== undefined,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @ValidateIf(
    (destination: DeliveryDestinationDto) =>
      destination.latitude !== undefined || destination.longitude !== undefined,
  )
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude?: number;
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

  @ApiProperty({ type: DeliveryDestinationDto })
  @ValidateNested()
  @Type(() => DeliveryDestinationDto)
  deliveryDestination!: DeliveryDestinationDto;

  @ApiProperty({ type: [SubmitOrderItemDto], minItems: 1, maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((item: SubmitOrderItemDto) => item.itemId)
  @ValidateNested({ each: true })
  @Type(() => SubmitOrderItemDto)
  items!: SubmitOrderItemDto[];
}
