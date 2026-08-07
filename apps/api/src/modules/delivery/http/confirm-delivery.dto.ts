import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Min, MinLength } from 'class-validator';

export class ConfirmDeliveryDto {
  @ApiProperty({ minimum: 1, example: 6 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ pattern: '^\\d{4,6}$', writeOnly: true, example: '4826' })
  @IsString()
  @Matches(/^\d{4,6}$/)
  pin!: string;

  @ApiProperty({ minLength: 1, example: 'Cliente receptor' })
  @IsString()
  @MinLength(1)
  receiver!: string;

  @ApiProperty({ minimum: 0, example: 250000 })
  @IsInt()
  @Min(0)
  cashReceivedCents!: number;
}
