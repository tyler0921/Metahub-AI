import type { AgentId } from '@shared';
import {
  CHIBI_DIRECTIONS,
  CHIBI_FRAMES,
  CHIBI_H,
  CHIBI_ROSTER,
  CHIBI_SHEET_RES,
  CHIBI_W,
} from '@/components/office/chibi-character';
import { SPRITE_OF } from '@/components/office/office-staff';

const FRAME_W = CHIBI_W * CHIBI_SHEET_RES;
const FRAME_H = CHIBI_H * CHIBI_SHEET_RES;
const SHEET_W = FRAME_W * CHIBI_DIRECTIONS.length * CHIBI_FRAMES;
/** 정면(down) 0번 프레임에서 머리만 잘라 낼 정사각 영역 — 치비 원본 좌표 (3,3)~(28,28) */
const HEAD = { x: 3 * CHIBI_SHEET_RES, y: 3 * CHIBI_SHEET_RES, size: 26 * CHIBI_SHEET_RES };

interface AgentFaceProps {
  readonly agentId: AgentId;
  readonly size: number;
  /** 시트에 없는 직원일 때 대신 보일 글자 (부서 약칭 등) */
  readonly fallback: string;
}

/** 오피스 캐릭터 시트에서 직원 얼굴만 잘라 동그란 아바타로 보여 줍니다 */
export function AgentFace({ agentId, size, fallback }: AgentFaceProps): React.JSX.Element {
  const sprite = SPRITE_OF.get(agentId) ?? agentId;
  const row = CHIBI_ROSTER.findIndex((entry) => entry.id === sprite);
  if (row < 0) return <>{fallback}</>;

  const scale = size / HEAD.size;
  return (
    <span
      style={{
        display: 'block',
        width: size,
        height: size,
        backgroundImage: 'url(/sprites/characters.png)',
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${SHEET_W * scale}px auto`,
        backgroundPosition: `${-HEAD.x * scale}px ${-(row * FRAME_H + HEAD.y) * scale}px`,
      }}
    />
  );
}
