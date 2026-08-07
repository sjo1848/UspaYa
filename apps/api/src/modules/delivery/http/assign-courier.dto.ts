import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AssignCourierDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  courierId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
