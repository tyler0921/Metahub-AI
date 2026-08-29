import type { Agent, TeamId } from '@shared';

/**
 * 부서(팀)별 참여 이유 — plan 이벤트에 reason 이 없을 때 프론트가 씁니다.
 *
 * 나중에 WorkPlan.assignments 에 reason 필드가 오면 그걸 우선하고,
 * 이 맵은 폴백으로만 남기면 됩니다.
 */
const TEAM_REASON: Record<TeamId, string> = {
  chief: '지시를 분해하고 부서를 조율하며 최종 검수를 담당합니다.',
  researcher: '시장·경쟁 정보를 모아 사실과 추정을 구분합니다.',
  planner: '목표를 지표화하고 로드맵·리스크를 정리합니다.',
  marketer: '포지셔닝·메시지·채널 전략을 제안합니다.',
  dev: '기술 구현 가능성과 예상 공수를 검토합니다.',
  finance: '예산·원가·수익성 시나리오를 검토합니다.',
  writer: '부서 원고를 하나의 산출물로 통합합니다.',
};

/** 직원 한 명에 대한 "왜 이 사람이 투입됐는가" 한 줄 */
export function participationReason(agent: Agent): string {
  if (agent.rank !== 'lead') {
    return `${agent.dept}의 ${agent.specialty}를 담당합니다.`;
  }
  return TEAM_REASON[agent.team] ?? agent.specialty;
}
