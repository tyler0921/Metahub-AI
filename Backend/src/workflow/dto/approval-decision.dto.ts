import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApprovalDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}
