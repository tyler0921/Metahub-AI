import { IsString, MaxLength, MinLength } from 'class-validator';

export class SelectLlmModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model!: string;
}
