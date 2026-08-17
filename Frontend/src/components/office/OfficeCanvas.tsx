import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentId, AgentStatus, AppConfigResponse, SpeechEvent } from '@shared';
import { WorkspaceSidebar, type WorkspaceTabKey } from '@/components/layout/WorkspaceSidebar';
import { useSessionStore } from '@/store/session.store';
import { ConversationFlow } from './ConversationFlow';
import { MeetingRoomBadge } from './MeetingRoomBadge';
import { NearbyCard } from './NearbyCard';
import { OfficeMinimap } from './OfficeMinimap';
import { OfficeOverview } from './OfficeOverview';
import { SpeechBubble } from './SpeechBubble';
import { useOfficeRenderer } from './useOfficeRenderer';
import { spaceActionAt } from './office-interactions';
import styles from './OfficeCanvas.module.css';

const MAX_BUBBLES = 4;
const SPEECH_VISIBLE_MS = 14_000;

interface OfficeCanvasProps {
  onSelectBrief: (brief: string) => void;
  /** 대표 집무실·로비에서 지시 콘솔을 펼칠 때 씁니다 */
  onOpenConsole?: () => void;
  /**
   * 실행 환경 (프로바이더·모델).
   * App 에서 이미 받아온 값을 내려받습니다 — 여기서 useCompanyConfig 를
   * 다시 부르면 부팅 때 같은 요청이 두 번 나갑니다.
   */
  config: AppConfigResponse | null;
}

export function OfficeCanvas({
  onSelectBrief,
  onOpenConsole,
  config,
}: OfficeCanvasProps): React.JSX.Element {
  const logs = useSessionStore((s) => s.logs);
  const agentMap = useSessionStore((s) => s.agentMap);
  const avatars = useSessionStore((s) => s.avatars);
  const [now, setNow] = useState(() => Date.now());
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [panelRequest, setPanelRequest] = useState<{ tab: WorkspaceTabKey; id: number }>({
    tab: 'log',
    id: 0,
  });
  const [showGuide, setShowGuide] = useState(
    () => window.localStorage.getItem('metahub-office-guide-seen') !== '1',
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const sessionSpeeches = useMemo(() => {
    const latest = new Map<string, SpeechEvent>();
    for (const entry of logs) {
      if (
        entry.kind === 'speech' &&
        now - entry.event.at <= SPEECH_VISIBLE_MS
      ) {
        latest.set(entry.event.agent, entry.event);
      }
    }
    return [...latest.values()].sort((a, b) => b.at - a.at).slice(0, MAX_BUBBLES);
  }, [logs, now]);

  const anchorIds = useMemo(
    () => [
      ...new Set(
        sessionSpeeches.flatMap((speech) =>
          speech.to ? [speech.agent, speech.to] : [speech.agent],
        ),
      ),
    ],
    [sessionSpeeches],
  );

  const {
    canvasRef,
    stageRef,
    anchors,
    positions,
    ambientSpeeches,
    nearby,
    currentZone,
    isLoading,
    error,
    zoomPercent,
    zoomIn,
    zoomOut,
    resetZoom,
    setMoveKey,
  } = useOfficeRenderer(anchorIds);

  const activeSpeeches = useMemo(
    () => [...sessionSpeeches, ...ambientSpeeches]
      .filter((speech) => now - speech.at <= SPEECH_VISIBLE_MS)
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_BUBBLES),
    [sessionSpeeches, ambientSpeeches, now],
  );

  const avatarStatuses = useMemo(() => {
    const map = new Map<AgentId, AgentStatus>();
    for (const [id, avatar] of avatars) {
      map.set(id, avatar.status);
    }
    return map;
  }, [avatars]);

  const openPanel = useCallback((tab: WorkspaceTabKey): void => {
    setPanelRequest((request) => ({ tab, id: request.id + 1 }));
  }, []);

  const playerPosition = positions.get('ceo');
  const zoneAction = useMemo(
    () => spaceActionAt(playerPosition, currentZone),
    [playerPosition, currentZone],
  );

  const runZoneAction = useCallback((): void => {
    if (!zoneAction) return;
    switch (zoneAction.type) {
      case 'panel':
        openPanel(zoneAction.tab);
        return;
      case 'console':
        onOpenConsole?.();
        return;
      case 'brief':
        onSelectBrief(zoneAction.brief);
    }
  }, [zoneAction, openPanel, onOpenConsole, onSelectBrief]);

  useEffect(() => {
    setInteractionOpen(false);
  }, [nearby?.agentId]);

  useEffect(() => {
    const handleInteraction = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        (target instanceof HTMLElement &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
      ) {
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (nearby) setInteractionOpen((open) => !open);
        else runZoneAction();
        return;
      }
      if (event.key === 'Escape' && interactionOpen) {
        event.preventDefault();
        setInteractionOpen(false);
      }
    };
    window.addEventListener('keydown', handleInteraction);
    return () => window.removeEventListener('keydown', handleInteraction);
  }, [nearby, runZoneAction, interactionOpen]);

  const dismissGuide = (): void => {
    setShowGuide(false);
    window.localStorage.setItem('metahub-office-guide-seen', '1');
  };

  const handleAgentBrief = (brief: string): void => {
    setInteractionOpen(false);
    onSelectBrief(brief);
  };

  return (
    <div className={styles.stage} ref={stageRef}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <MeetingRoomBadge />

      <ConversationFlow
        speeches={activeSpeeches}
        agents={agentMap}
        anchors={anchors}
      />

      {isLoading && !error && (
        <div className={styles.overlay}>오피스를 불러오는 중…</div>
      )}

      {error && (
        <div className={`${styles.overlay} ${styles.error}`}>
          <b>스프라이트를 불러오지 못했습니다.</b>
          <pre>node Frontend/tools/generate_sprites.mjs</pre>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.bubbleLayer}>
        {activeSpeeches.map((speech) => {
          const speaker = agentMap.get(speech.agent);
          const anchor = anchors.get(speech.agent);
          if (!speaker || !anchor) return null;

          return (
            <SpeechBubble
              key={`${speech.agent}-${speech.at}`}
              speaker={speaker}
              listener={speech.to ? (agentMap.get(speech.to) ?? null) : null}
              text={speech.text}
              left={anchor.left}
              top={anchor.top}
            />
          );
        })}
      </div>

      {nearby && (
        <NearbyCard
          info={nearby}
          expanded={interactionOpen}
          onExpand={() => setInteractionOpen(true)}
          onClose={() => setInteractionOpen(false)}
          onSelectBrief={handleAgentBrief}
        />
      )}

      {!nearby && zoneAction && (
        <button type="button" className={styles.zoneAction} onClick={runZoneAction}>
          <kbd>F</kbd>
          <span>
            <b>{zoneAction.label}</b>
            {zoneAction.hint}
          </span>
        </button>
      )}

      {showGuide && !isLoading && !error && (
        <section className={styles.guide} aria-label="오피스 이동 안내">
          <div>
            <strong>MetaHub 오피스에 오신 것을 환영합니다</strong>
            <p><kbd>WASD</kbd> 또는 클릭으로 이동하고, 직원 곁에서 <kbd>F</kbd>를 눌러보세요.</p>
          </div>
          <button type="button" onClick={dismissGuide} aria-label="안내 닫기">
            <span aria-hidden="true">×</span>
          </button>
        </section>
      )}

      <nav className={styles.spaceRail} aria-label="공간 메뉴">
        <div className={styles.railLogo} aria-label="MetaHub AI">M</div>
        <div className={styles.railGroup}>
          <button type="button" className={styles.railActive} aria-label="오피스 보기" data-label="오피스" onClick={resetZoom}>
            <span aria-hidden="true">⌂</span>
          </button>
          <button type="button" aria-label="업무 열기" data-label="업무" onClick={() => openPanel('tasks')}>
            <span aria-hidden="true">◰</span>
          </button>
          <button type="button" aria-label="대화 열기" data-label="대화" onClick={() => openPanel('log')}>
            <span aria-hidden="true">◌</span>
          </button>
          <button type="button" aria-label="산출물 열기" data-label="산출물" onClick={() => openPanel('result')}>
            <span aria-hidden="true">▤</span>
          </button>
          <button type="button" aria-label="볼트 열기" data-label="볼트" onClick={() => openPanel('vault')}>
            <span aria-hidden="true">◇</span>
          </button>
        </div>
        <div className={styles.railBottom}>
          {/* TopBar 를 없애면서 실행 환경 표시가 여기로 내려왔습니다 */}
          {config && (
            <div className={styles.railMeta} title={`${config.provider} · ${config.model}`}>
              <span>{config.provider}</span>
              <span className={styles.railMetaModel}>
                {config.provider === 'mock' ? '체험 모드' : config.model}
              </span>
            </div>
          )}
          <button type="button" aria-label="이동 도움말" data-label="도움말" onClick={() => setShowGuide(true)}>
            <span aria-hidden="true">?</span>
          </button>
        </div>
      </nav>

      <OfficeOverview currentZone={currentZone} compact={Boolean(nearby)} />

      <OfficeMinimap positions={positions} statuses={avatarStatuses} />

      <div className={styles.touchControls} aria-label="캐릭터 이동">
        <button
          type="button"
          className={styles.touchUp}
          aria-label="위로 이동"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMoveKey('ArrowUp', true);
          }}
          onPointerUp={() => setMoveKey('ArrowUp', false)}
          onPointerCancel={() => setMoveKey('ArrowUp', false)}
        >↑</button>
        <button
          type="button"
          className={styles.touchLeft}
          aria-label="왼쪽으로 이동"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMoveKey('ArrowLeft', true);
          }}
          onPointerUp={() => setMoveKey('ArrowLeft', false)}
          onPointerCancel={() => setMoveKey('ArrowLeft', false)}
        >←</button>
        <button
          type="button"
          className={styles.touchDown}
          aria-label="아래로 이동"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMoveKey('ArrowDown', true);
          }}
          onPointerUp={() => setMoveKey('ArrowDown', false)}
          onPointerCancel={() => setMoveKey('ArrowDown', false)}
        >↓</button>
        <button
          type="button"
          className={styles.touchRight}
          aria-label="오른쪽으로 이동"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setMoveKey('ArrowRight', true);
          }}
          onPointerUp={() => setMoveKey('ArrowRight', false)}
          onPointerCancel={() => setMoveKey('ArrowRight', false)}
        >→</button>
      </div>

      <div className={styles.zoomControls}>
        <button type="button" className={styles.zoomBtn} onClick={zoomOut} aria-label="축소">
          −
        </button>
        <button
          type="button"
          className={styles.zoomLabel}
          onClick={resetZoom}
          title="기본 배율 (0)"
        >
          {zoomPercent}%
        </button>
        <button type="button" className={styles.zoomBtn} onClick={zoomIn} aria-label="확대">
          +
        </button>
      </div>

      <div className={styles.sidebarDock}>
        <WorkspaceSidebar
          embedded
          onSelectBrief={onSelectBrief}
          openTab={panelRequest.tab}
          openRequestId={panelRequest.id}
        />
      </div>

      <div className={styles.helpChip} aria-hidden="true">
        <kbd>WASD</kbd><span>이동</span><kbd>F</kbd><span>상호작용</span>
      </div>
    </div>
  );
}
