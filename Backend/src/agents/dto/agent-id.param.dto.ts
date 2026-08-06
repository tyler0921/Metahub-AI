import { IsIn } from 'class-validator';
import type { AgentId } from '@shared';

const AGENT_IDS = [
  'chief',
  'planner',
  'researcher',
  'marketer',
  'dev',
  'finance',
  'writer',
] as const satisfies readonly AgentId[];

export class AgentIdParamDto {
  @IsIn(AGENT_IDS, { message: '존재하지 않는 직원 id 입니다.' })
  id!: AgentId;
}
