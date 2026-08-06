import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { CreateSessionRequest } from '@shared';

export class CreateSessionDto implements CreateSessionRequest {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: '지시 내용을 입력하세요.' })
  @MinLength(5, { message: '지시가 너무 짧습니다. 조금 더 구체적으로 적어주세요.' })
  @MaxLength(4000, { message: '지시는 4000자를 넘을 수 없습니다.' })
  brief!: string;

  /**
   * 이어서 지시할 원본 세션.
   * 지정하면 그 산출물을 물려받아 처음부터 다시 만들지 않고 고쳐 씁니다.
   */
  @IsOptional()
  @IsUUID('4', { message: '이어서 작업할 세션 id 가 올바르지 않습니다.' })
  parentSessionId?: string;
}
