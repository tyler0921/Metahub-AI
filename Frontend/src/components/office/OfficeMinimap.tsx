import { useEffect, useRef } from 'react';
import type { AgentId, AgentStatus } from '@shared';
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
}

const WIDTH = 148;
const HEIGHT = 96;

/** 축소된 오피스 맵 — 구역 윤곽과 직원·대표 위치를 점으로 표시합니다. */
export function OfficeMinimap({
  positions,
  statuses,
}: OfficeMinimapProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
        ctx.strokeStyle = '#6c63ff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  }, [positions, statuses]);

  return (
    <div className={styles.wrap} aria-label="오피스 미니맵">
      <span className={styles.label}>MAP</span>
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
