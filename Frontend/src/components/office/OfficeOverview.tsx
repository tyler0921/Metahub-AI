import { PHASE_SEQUENCE } from '@/constants/phases';
import { useSessionStore } from '@/store/session.store';
import { MAP_COLS, MAP_ROWS, ZONES, type ZoneKind } from './office-map';
import type { ZoneInfo } from './office-renderer';
import styles from './OfficeOverview.module.css';

interface OfficeOverviewProps {
  currentZone: ZoneInfo | null;
  compact?: boolean;
}

/** 공간 성격을 한두 단어로 — 카드 아래 태그로 붙습니다 */
const KIND_TAGS: Record<ZoneKind, readonly string[]> = {
  entrance: ['로비', '커뮤니케이션'],
  department: ['업무 공간'],
  meeting: ['회의'],
  reception: ['안내'],
  lounge: ['전시'],
  cafe: ['휴식'],
};

const LOBBY = ZONES.find((zone) => zone.kind === 'entrance') ?? ZONES[0]!;

/**
 * 오피스 배경(office-v3.png)에서 이 방 영역만 잘라 보여 주는 CSS.
 * 별도 썸네일을 만들지 않아도 맵이 바뀌면 같이 바뀝니다.
 */
function thumbnailStyle(zoneId: string | undefined): React.CSSProperties {
  const zone = ZONES.find((item) => item.id === zoneId) ?? LOBBY;
  const position = (offset: number, size: number, total: number): string =>
    total === size ? '0%' : `${(offset / (total - size)) * 100}%`;
  return {
    backgroundSize: `${(MAP_COLS / zone.w) * 100}% ${(MAP_ROWS / zone.h) * 100}%`,
    backgroundPosition: `${position(zone.x, zone.w, MAP_COLS)} ${position(zone.y, zone.h, MAP_ROWS)}`,
  };
}

export function OfficeOverview({
  currentZone,
  compact = false,
}: OfficeOverviewProps): React.JSX.Element {
  const agents = useSessionStore((s) => s.agents);
  const avatars = useSessionStore((s) => s.avatars);
  const isRunning = useSessionStore((s) => s.isRunning);
  const currentPhase = useSessionStore((s) => s.currentPhase);
  const phaseLabel = PHASE_SEQUENCE.find((phase) => phase.key === currentPhase)?.label;
  const working = [...avatars.values()].filter(
    (avatar) => avatar.status === 'thinking' || avatar.status === 'talking',
  ).length;

  const zone = ZONES.find((item) => item.id === currentZone?.id) ?? LOBBY;
  const label = currentZone?.label ?? LOBBY.label;
  const tags = zone.kind === 'department' ? [`${label}팀`, ...KIND_TAGS.department] : KIND_TAGS[zone.kind];

  return (
    <aside className={`${styles.card} ${compact ? styles.compact : ''}`} aria-label="현재 공간">
      <div className={styles.thumb} style={thumbnailStyle(zone.id)} aria-hidden="true" />
      <div className={styles.roomInfo}>
        <span className={styles.titleRow}>
          <strong>{label}</strong>
          <em>본사 1층</em>
        </span>
        <small>
          {isRunning
            ? `${phaseLabel ?? '업무'} · ${working}명 작업 중`
            : '업무 가능 · 자유롭게 둘러보세요.'}
        </small>
        <span className={styles.tags}>
          {tags.map((tag) => (
            <i key={tag}>#{tag}</i>
          ))}
          <i>{agents.length}명</i>
        </span>
      </div>
    </aside>
  );
}
