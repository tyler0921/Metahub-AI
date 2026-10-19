import { useEffect, useRef, useState } from 'react';
import type { AgentId, AgentStatus } from '@shared';
import { Icon } from '@/components/common/Icon';
import { STATUS_COLOR } from '@/lib/agent-status';
import { MAP_COLS, MAP_ROWS, ZONES } from './office-map';
import styles from './OfficeMinimap.module.css';

export interface ActorPosition {
  x: number;
  y: number;
  isPlayer: boolean;
}

interface OfficeMinimapProps {
  positions: ReadonlyMap<string, ActorPosition>;
  statuses: ReadonlyMap<AgentId, AgentStatus>;
  /** "전체 보기" — 맵 전체가 들어오는 기본 배율로 되돌립니다 */
  onShowAll?: () => void;
}

/** 맵 비율(82×34 타일)을 그대로 지킵니다 — 예전 148×96 은 세로로 늘어나 보였습니다 */
const WIDTH = 200;
const HEIGHT = Math.round((WIDTH * MAP_ROWS) / MAP_COLS);
const MAP_SRC = '/map/office-v3.png';

/** 축소된 오피스 맵 — 구역 윤곽과 직원·대표 위치를 점으로 표시합니다. */
export function OfficeMinimap({
  positions,
  statuses,
  onShowAll,
}: OfficeMinimapProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 실제 오피스 배경을 축소해 깔면 방 모양이 그대로 읽힙니다
  const [backdrop, setBackdrop] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setBackdrop(image);
    image.src = MAP_SRC;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const scaleX = WIDTH / MAP_COLS;
    const scaleY = HEIGHT / MAP_ROWS;

    ctx.fillStyle = '#141a23';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (backdrop) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(backdrop, 0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;
    }

    for (const zone of ZONES) {
      ctx.fillStyle = `${zone.color}55`;
      ctx.fillRect(
        zone.x * scaleX,
        zone.y * scaleY,
        zone.w * scaleX,
        zone.h * scaleY,
      );
    }

    for (const [id, pos] of positions) {
      const status = statuses.get(id as AgentId) ?? 'idle';
      const color = pos.isPlayer ? '#ffffff' : STATUS_COLOR[status];
      const px = pos.x * scaleX;
      const py = pos.y * scaleY;
      const radius = pos.isPlayer ? 3.2 : 2.4;

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (pos.isPlayer) {
        ctx.strokeStyle = '#6352f5';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }, [positions, statuses, backdrop]);

  return (
    <div className={styles.wrap} aria-label="오피스 미니맵">
      <div className={styles.head}>
        <span className={styles.label}>MAP</span>
        {onShowAll && (
          <button type="button" className={styles.showAll} onClick={onShowAll}>
            전체 보기
            <Icon name="maximize" size={14} />
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={WIDTH}
        height={HEIGHT}
        aria-hidden="true"
      />
    </div>
  );
}
