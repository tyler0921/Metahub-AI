import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateBacklogDto {
  @IsString()
  @MinLength(5)
  @MaxLength(2_000)
  brief!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;
}
