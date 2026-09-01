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
  'designer',
  'chief-senior',
  'chief-junior',
  'planner-senior',
  'planner-junior',
  'researcher-senior',
  'researcher-junior',
  'marketer-senior',
  'marketer-junior',
  'dev-senior',
  'dev-junior',
  'finance-senior',
  'finance-junior',
  'writer-senior',
  'writer-junior',
  'designer-senior',
  'designer-junior',
] as const satisfies readonly AgentId[];

export class AmbientChatDto {
  @IsIn(AGENT_IDS, { message: '존재하지 않는 직원 id 입니다.' })
  agentA!: AgentId;

  @IsIn(AGENT_IDS, { message: '존재하지 않는 직원 id 입니다.' })
  agentB!: AgentId;
}
