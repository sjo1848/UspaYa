import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class StartPickupDto {
  @ApiProperty({ minimum: 1, example: 2 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ConfirmPickupDto extends StartPickupDto {
  @ApiProperty({ minLength: 1, example: 'Responsable comercio' })
  @IsString()
  @MinLength(1)
  merchantResponsible!: string;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  packageCount!: number;
}
