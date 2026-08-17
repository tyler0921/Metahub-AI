import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AgentId, SpeechEvent } from '@shared';
import { useSessionStore } from '@/store/session.store';
import { DEPARTMENT_ZONES } from './office-map';
import { STAFF_SEATS } from './office-staff';
import { OfficeRenderer, ZOOM_DEFAULT, type NearbyInfo, type ZoneInfo } from './office-renderer';
import type { ActorPosition } from './OfficeMinimap';
import { loadSpriteAssets } from './sprites';

interface OfficeBinding {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  anchors: Map<string, { left: number; top: number }>;
  positions: ReadonlyMap<string, ActorPosition>;
  ambientSpeeches: SpeechEvent[];
  nearby: NearbyInfo | null;
  currentZone: ZoneInfo | null;
  isLoading: boolean;
  error: string | null;
  zoomPercent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setMoveKey: (key: string, pressed: boolean) => void;
}

/** 교차검토·개정 단계에는 직원들이 회의실에 모입니다 */
const MEETING_PHASES = new Set(['feedback', 'revise']);

/**
 * 직원 좌석 — 타일 좌표.
 * 팀장은 `office-map.ts` 의 ZONES, 팀원은 `office-staff.ts` 에서 옵니다.
 * 작업이 끝나면 각자 이 자리로 돌아갑니다.
 */
const SEATS = new Map<AgentId, { x: number; y: number }>([
  ...DEPARTMENT_ZONES.map((z) => [z.agent!, z.seat!] as const),
  ...STAFF_SEATS.map((s) => [s.id, s.seat] as const),
]);

/**
 * 캔버스 렌더러를 React 수명주기에 연결합니다.
 * 렌더러는 rAF 로 독립적으로 돌고, 스토어 변화는 subscribe 로 직접 밀어 넣습니다.
 */
export function useOfficeRenderer(anchorIds: string[]): OfficeBinding {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<OfficeRenderer | null>(null);

  const [anchors, setAnchors] = useState<Map<string, { left: number; top: number }>>(new Map());
  const [positions, setPositions] = useState<ReadonlyMap<string, ActorPosition>>(new Map());
  const [ambientSpeeches, setAmbientSpeeches] = useState<SpeechEvent[]>([]);
  const [nearby, setNearby] = useState<NearbyInfo | null>(null);
  const [currentZone, setCurrentZone] = useState<ZoneInfo | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState({ current: ZOOM_DEFAULT, base: ZOOM_DEFAULT });

  const agents = useSessionStore((s) => s.agents);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || agents.length === 0) return;

    let renderer: OfficeRenderer | null = null;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let observer: ResizeObserver | null = null;

    void loadSpriteAssets()
      .then((assets) => {
        if (disposed) return;

        renderer = new OfficeRenderer(canvas, assets, agents, SEATS, {
          onBubbleAnchors: (next) => setAnchors(new Map(next)),
          onNearbyChange: setNearby,
          onZoneChange: setCurrentZone,
          onZoomChange: (current, base) => setZoom({ current, base }),
          onActorPositions: setPositions,
          onAmbientSpeech: (event) => {
            const cutoff = Date.now() - 14_000;
            setAmbientSpeeches((current) =>
              [...current.filter((speech) => speech.at >= cutoff), event].slice(-8),
            );
          },
          // 클릭은 스토어로 바로 보냅니다 — 사이드바가 그 값을 보고 상세로 전환합니다
          onActorSelect: (agentId) => useSessionStore.getState().selectAgent(agentId),
        });
        rendererRef.current = renderer;

        const applySize = (): void => {
          const rect = stage.getBoundingClientRect();
          renderer?.resize(rect.width, rect.height);
        };
        applySize();
        observer = new ResizeObserver(applySize);
        observer.observe(stage);

        // 레이아웃이 늦게 잡히면 0×0 캔버스가 되어 화면이 비어 보입니다
        const ensureSized = (): void => {
          if (disposed || !renderer || !renderer.needsSize) return;
          applySize();
          requestAnimationFrame(ensureSized);
        };
        requestAnimationFrame(ensureSized);

        renderer.start();
        setLoading(false);

        let lastPhase: string | null = null;
        let lastTeamKey = '';
        let lastToolKey = '';
        let lastAlert = false;
        const lastSignature = new Map<AgentId, string>();

        unsubscribe = useSessionStore.subscribe((state) => {
          if (!renderer) return;

          for (const [id, avatar] of state.avatars) {
            const signature = `${avatar.status}|${avatar.talkingTo ?? ''}`;
            if (lastSignature.get(id) === signature) continue;
            lastSignature.set(id, signature);

            const seat = SEATS.get(id);
            if (seat) renderer.setStatus(id, avatar.status, seat.x, seat.y);
            if (avatar.talkingTo) renderer.faceToward(id, avatar.talkingTo);
          }

          // 도구 아이콘 — Map 내용을 키로 비교해 바뀐 때만 반영합니다
          const toolKey = [...state.activeTools.entries()]
            .map(([id, t]) => `${id}:${t.tool}:${t.label}`)
            .sort()
            .join('|');
          if (toolKey !== lastToolKey) {
            lastToolKey = toolKey;
            for (const id of SEATS.keys()) {
              const active = state.activeTools.get(id);
              renderer.setTool(id, active?.tool ?? null, active?.label ?? '');
            }
          }

          const alertOn = Boolean(state.errorMessage);
          if (alertOn !== lastAlert) {
            lastAlert = alertOn;
            renderer.setSessionAlert(alertOn);
          }

          // 투입 부서가 정해지면 나머지 구역의 조명을 낮춥니다
          const teamKey = state.team.join(',');
          if (teamKey !== lastTeamKey) {
            lastTeamKey = teamKey;
            renderer.setActiveTeams(state.isRunning ? state.team : []);
          }

          const phase = state.currentPhase;
          if (phase !== lastPhase) {
            lastPhase = phase;
            const inMeeting = phase !== null && MEETING_PHASES.has(phase);
            const team =
              state.team.length > 0
                ? state.team
                : [...state.avatars.keys()].filter((id) =>
                    state.logs.some((l) => l.kind === 'speech' && l.event.agent === id),
                  );
            renderer.setMeetingMode(inMeeting, team, SEATS);
          }

          if (!state.isRunning && state.logs.length === 0) {
            renderer.resetAll(SEATS);
            renderer.setActiveTeams([]);
            lastTeamKey = '';
            lastToolKey = '';
            lastAlert = false;
          }
        });
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setError(err instanceof Error ? err.message : '오피스를 불러오지 못했습니다.');
        setLoading(false);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
      observer?.disconnect();
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, [agents]);

  // 말풍선이 떠 있는 대상만 좌표를 계산하게 해 불필요한 리렌더를 막습니다
  const ambientAnchorIds = ambientSpeeches.flatMap((speech) =>
    speech.to ? [speech.agent, speech.to] : [speech.agent],
  );
  const anchorKey = [...new Set([...anchorIds, ...ambientAnchorIds])].join(',');
  useEffect(() => {
    rendererRef.current?.setAnchorTargets(anchorKey ? anchorKey.split(',') : []);
  }, [anchorKey, isLoading]);

  return {
    canvasRef,
    stageRef,
    anchors,
    positions,
    ambientSpeeches,
    nearby,
    currentZone,
    isLoading,
    error,
    zoomPercent: Math.round((zoom.current / zoom.base) * 100 / 5) * 5,
    zoomIn: () => rendererRef.current?.zoomIn(),
    zoomOut: () => rendererRef.current?.zoomOut(),
    resetZoom: () => rendererRef.current?.resetZoom(),
    setMoveKey: (key, pressed) => rendererRef.current?.setMoveKey(key, pressed),
  };
}
