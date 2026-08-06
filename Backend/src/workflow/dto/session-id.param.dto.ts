import { IsUUID } from 'class-validator';

export class SessionIdParamDto {
  @IsUUID('4', { message: '올바른 세션 id 가 아닙니다.' })
  id!: string;
}
