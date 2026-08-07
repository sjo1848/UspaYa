import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class StartPickupDto {
  @ApiProperty({ minimum: 1, example: 2 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ConfirmPickupDto extends StartPickupDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Responsable comercio' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  merchantResponsible!: string;

  @ApiProperty({ minimum: 1, maximum: 100, example: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  packageCount!: number;
}
