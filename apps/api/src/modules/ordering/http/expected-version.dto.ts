import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExpectedVersionDto {
  @ApiProperty({ minimum: 1, description: 'Aggregate version observed by the caller.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
