import type { WorkspaceTabKey } from '@/components/layout/WorkspaceSidebar';
import type { ZoneInfo } from './office-renderer';
import { DEPARTMENT_ZONES } from './office-map';

/**
 * 공간에서 무엇을 할 수 있는가.
 *
 * 가구를 하나하나 클릭 대상으로 만들지 않았습니다. 렌더러가 프롭을 좌표로만
 * 알고 있어서 히트박스를 새로 얹어야 하는데, 그러면 맵이 바뀔 때마다 두 곳을
 * 고쳐야 합니다. 대신 **구역**을 진입점으로 씁니다 — 회의실에 서면 회의 테이블
 * 앞이고, 쇼케이스에 서면 결과물 앞입니다.
 */
export type ZoneAction =
  /** 사이드 패널의 특정 탭을 연다 */
  | { type: 'panel'; label: string; hint: string; tab: WorkspaceTabKey }
  /** 지시 콘솔을 펼치고 커서를 놓는다 */
  | { type: 'console'; label: string; hint: string }
  /** 콘솔에 문장을 채워 넣는다 (전송은 대표가 직접) */
  | { type: 'brief'; label: string; hint: string; brief: string };

interface InteractionSpot {
  x: number;
  y: number;
  radius: number;
  action: ZoneAction;
}

/** 구역별 상호작용 — id 를 먼저 보고, 없으면 kind 로 떨어집니다 */
const BY_ID: Record<string, ZoneAction> = {
  // 대표 집무실 = CEO 책상. 여기서는 지시를 내립니다.
  reception: {
    type: 'console',
    label: '대표 집무실',
    hint: '새 업무 지시하기',
  },
  // 회의 테이블 — 지금 무엇이 오갔고 어떻게 검토됐는지
  boardroom: {
    type: 'panel',
    label: '보드룸',
    hint: '진행·검토 내용 보기',
    tab: 'log',
  },
  // 소회의실 — 부서를 불러 모으는 자리
  'huddle-room': {
    type: 'brief',
    label: '허들룸',
    hint: '협업 회의 소집',
    brief: '현재 안건을 회의실에서 관련 부서들이 함께 검토하고 결론을 보고해줘.',
  },
  // 상황판이 있는 작업실 — 누가 무엇을 맡았는지
  'project-studio': {
    type: 'panel',
    label: '프로젝트 스튜디오',
    hint: '업무 보드 열기',
    tab: 'tasks',
  },
  // 완성된 결과물이 전시되는 곳
  showcase: {
    type: 'panel',
    label: '쇼케이스',
    hint: '산출물 보기',
    tab: 'result',
  },
  // 조용히 읽는 공간 — 볼트에 쌓인 과거 문서
  'focus-lounge': {
    type: 'panel',
    label: '포커스 라운지',
    hint: '볼트 문서 열기',
    tab: 'vault',
  },
  // 커피 한 잔 하며 진행 상황 듣기
  cafe: {
    type: 'brief',
    label: '오피스 카페',
    hint: '진행 상황 요약 요청',
    brief: '지금까지 진행된 내용을 핵심만 요약해서 보고해줘.',
  },
  entrance: {
    type: 'console',
    label: '메인 로비',
    hint: '새 업무 지시하기',
  },
};

/**
 * Gather처럼 상호작용은 방 전체가 아니라 의미 있는 가구 주변에서만 열립니다.
 * 좌표는 office-map.ts의 프롭 중심과 맞춥니다.
 */
const SPOTS: readonly InteractionSpot[] = [
  { x: 27, y: 6, radius: 3.4, action: BY_ID.reception },
  { x: 42, y: 6, radius: 4.5, action: BY_ID.boardroom },
  { x: 19, y: 17, radius: 3.2, action: BY_ID['huddle-room'] },
  { x: 32, y: 17, radius: 3.2, action: BY_ID['project-studio'] },
  { x: 18, y: 25, radius: 3.8, action: BY_ID.showcase },
  { x: 45, y: 25, radius: 4.0, action: BY_ID.cafe },
  { x: 34, y: 25, radius: 4.0, action: BY_ID['focus-lounge'] },
  { x: 26, y: 28, radius: 3.2, action: BY_ID.entrance },
];

const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 이 구역에서 F 를 누르면 무슨 일이 일어나는가.
 * 상호작용이 없는 구역이면 null 을 돌려주고, 화면에는 버튼이 뜨지 않습니다.
 */
export function zoneActionOf(zone: ZoneInfo | null): ZoneAction | null {
  if (!zone) return null;

  const byId = BY_ID[zone.id];
  if (byId) return byId;

  // 부서 구역은 전부 같은 방식으로 동작합니다 — 그 팀에 일을 맡깁니다
  if (zone.kind === 'department') {
    return {
      type: 'brief',
      label: zone.label,
      hint: '이 부서에 업무 요청',
      brief: `${zone.label}에 다음 업무를 요청할게: `,
    };
  }

  return null;
}

/** 플레이어 위치에서 실제로 사용할 수 있는 오브젝트 액션을 찾습니다. */
export function spaceActionAt(
  player: { x: number; y: number } | undefined,
  zone: ZoneInfo | null,
): ZoneAction | null {
  if (!player) return null;

  const spot = SPOTS.find((candidate) => distance(player, candidate) <= candidate.radius);
  if (spot) return spot.action;

  if (zone?.kind === 'department') {
    const department = DEPARTMENT_ZONES.find((candidate) => candidate.id === zone.id);
    if (department?.seat && distance(player, department.seat) <= 3.2) {
      return zoneActionOf(zone);
    }
  }

  return null;
}
