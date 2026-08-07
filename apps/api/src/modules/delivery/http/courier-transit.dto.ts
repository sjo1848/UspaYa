import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class CourierTransitDto {
  @ApiProperty({ minimum: 1, example: 4 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
