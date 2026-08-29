import type { AgentStatus } from '@shared';

/**
 * 상태 4색 — `global.css` 의 `--st-*` 와 **같은 값**이어야 합니다.
 *
 * 캔버스는 CSS 변수를 읽지 못해서 이 상수가 필요합니다.
 * 렌더러도 여기서 가져다 씁니다 — 예전에는 렌더러가 자기 복사본을 들고
 * 있어서 팔레트를 바꿀 때마다 두 곳을 따로 고쳐야 했습니다.
 */
export const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#9aa0a8',
  thinking: '#f2b84b',
  talking: '#4a90e2',
  done: '#4fa878',
};

/** 상태색의 옅은 배경 — 배지·트랙에 씁니다 */
export const STATUS_TINT: Record<AgentStatus, string> = {
  idle: 'rgb(154 160 168 / 14%)',
  thinking: 'rgb(242 184 75 / 16%)',
  talking: 'rgb(74 144 226 / 14%)',
  done: 'rgb(79 168 120 / 16%)',
};

export const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: '대기 중',
  thinking: '작업 중',
  talking: '발언 중',
  done: '완료',
};

/** 부서명 → 카드 배지용 2글자 */
export function deptAbbrev(dept: string): string {
  const trimmed = dept.replace(/팀$|실$/, '').trim();
  if (trimmed.length <= 2) return trimmed;
  return trimmed.slice(0, 2);
}
