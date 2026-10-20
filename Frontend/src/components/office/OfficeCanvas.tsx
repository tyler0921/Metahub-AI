import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentId, AgentStatus, AppConfigResponse, SpeechEvent } from '@shared';
import { Icon, type IconName } from '@/components/common/Icon';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import { useSessionStore } from '@/store/session.store';
import { WORKSPACE_TABS, useUiStore, type WorkspaceTabKey } from '@/store/ui.store';
import { CharacterCustomizer } from './CharacterCustomizer';
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

/** 하단 메뉴 아이콘 — 상단 탭과 같은 이름(WORKSPACE_TABS)을 씁니다 */
const TAB_ICONS: Record<WorkspaceTabKey, IconName> = {
  tasks: 'tasks',
  log: 'chat',
  result: 'package',
  vault: 'book',
};
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
  /** 하단 지시 콘솔이 펼쳐졌는지 — 공간 메뉴 알약을 그만큼 밀어 올립니다 */
  consoleExpanded?: boolean;
}

export function OfficeCanvas({
  onSelectBrief,
  onOpenConsole,
  config,
  consoleExpanded = false,
}: OfficeCanvasProps): React.JSX.Element {
  const logs = useSessionStore((s) => s.logs);
  const agentMap = useSessionStore((s) => s.agentMap);
  const avatars = useSessionStore((s) => s.avatars);
  const [now, setNow] = useState(() => Date.now());
  const [interactionOpen, setInteractionOpen] = useState(false);
  const requestPanel = useUiStore((s) => s.requestPanel);
  const panelRequest = useUiStore((s) => s.panelRequest);
  const openTab = useUiStore((s) => s.openPanel);
  const [showGuide, setShowGuide] = useState(
    () => window.localStorage.getItem('metahub-office-guide-seen') !== '1',
  );
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [isTouch] = useState(() => window.matchMedia('(pointer: coarse)').matches);

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
    followId,
    stopFollow,
    zoomIn,
    zoomOut,
    resetZoom,
    setMoveKey,
    ceoAppearance,
    setCeoAppearance,
  } = useOfficeRenderer(anchorIds);

  // 상단 "오피스" 탭 — 패널은 WorkspaceSidebar 가 닫고, 배율은 여기서 되돌립니다
  useEffect(() => {
    if (panelRequest.id > 0 && panelRequest.tab === 'office') resetZoom();
  }, [panelRequest, resetZoom]);

  const followedAgent = followId ? (agentMap.get(followId) ?? null) : null;

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
    requestPanel(tab);
  }, [requestPanel]);

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
    <div
      className={`${styles.stage} ${consoleExpanded ? styles.consoleOpen : ''}`}
      ref={stageRef}
    >
      {/*
        캔버스는 스크린리더에 그림 한 장입니다. 같은 정보(직원·상태·진행)는
        활동 패널의 목록으로 읽을 수 있고, 이동은 WASD·방향키로 됩니다.
      */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label="MetaHub 오피스 지도. 직원 위치와 상태는 활동 패널에서 목록으로 볼 수 있습니다."
      />

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
          <b>오피스 그림을 불러오지 못했습니다. 아래 명령으로 다시 만든 뒤 새로고침하세요.</b>
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

      {/*
        화면 위 가운데 — 잠깐 떴다 사라지는 알림들을 한 줄로 쌓습니다.
        각자 절대 위치를 가지면 회의·추적·안내가 동시에 뜰 때 서로 덮습니다.
      */}
      <div className={styles.topCenter}>
        <MeetingRoomBadge />

        {followedAgent && (
          <div className={styles.followChip} role="status">
            <span className={styles.followDot} aria-hidden="true" />
            <span><b>{followedAgent.name}</b> 따라가는 중</span>
            <button type="button" onClick={stopFollow}>그만 보기</button>
          </div>
        )}

        {showGuide && !isLoading && !error && (
          <section className={styles.guide} aria-label="오피스 이동 안내">
            <div>
              <strong>MetaHub 오피스에 오신 것을 환영합니다</strong>
              {/* 터치 화면에는 키보드가 없으니 화면에 보이는 조작으로 안내합니다 */}
              {isTouch ? (
                <p>왼쪽 아래 방향 버튼이나 바닥을 두 번 탭해 이동하고, 직원 곁에서 <b>말 걸기</b>를 눌러보세요.</p>
              ) : (
                <p><kbd>WASD</kbd> 또는 바닥 더블클릭으로 이동하고, 직원 곁에서 <kbd>F</kbd>를 눌러보세요.</p>
              )}
            </div>
            <button type="button" onClick={dismissGuide} aria-label="안내 닫기">
              <span aria-hidden="true">×</span>
            </button>
          </section>
        )}
      </div>

      {/*
        화면 아래 가운데 — 공간 액션과 메뉴를 지시 콘솔 바로 위에 쌓습니다.
        콘솔이 펼쳐지면 .consoleOpen 이 --dock-bottom 을 올려 함께 밀려 올라갑니다.
      */}
      <div className={styles.bottomDock}>
        {!nearby && zoneAction && (
          <button type="button" className={styles.zoneAction} onClick={runZoneAction}>
            <kbd>F</kbd>
            <span>
              <b>{zoneAction.label}</b>
              {zoneAction.hint}
            </span>
          </button>
        )}

        <nav className={styles.spaceRail} aria-label="공간 메뉴">
          <div className={styles.railGroup}>
            <button
              type="button"
              className={openTab === null ? styles.railActive : ''}
              aria-label="오피스 보기"
              aria-current={openTab === null ? 'page' : undefined}
              data-label="오피스"
              onClick={() => requestPanel('office')}
            >
              <Icon name="home" />
            </button>
            {WORKSPACE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={openTab === tab.key ? styles.railActive : ''}
                aria-label={`${tab.label} 열기`}
                aria-current={openTab === tab.key ? 'page' : undefined}
                data-label={tab.label}
                onClick={() => openPanel(tab.key)}
              >
                <Icon name={TAB_ICONS[tab.key]} />
              </button>
            ))}
          </div>
          {/* 실행 환경 — 어떤 모델이 일하고 있는지 */}
          {config && (
            <div className={styles.railMeta} title={`${config.provider} · ${config.model}`}>
              <span>AI 모델</span>
              <span className={styles.railMetaModel}>
                {config.provider === 'mock' ? '체험 모드' : config.model}
              </span>
            </div>
          )}
          <div className={styles.railGroup}>
            <button
              type="button"
              aria-label="외형 설정"
              aria-expanded={customizerOpen}
              data-label="외형"
              onClick={() => setCustomizerOpen((open) => !open)}
            >
              <Icon name="user" />
            </button>
            <button type="button" aria-label="이동 도움말" data-label="도움말" onClick={() => setShowGuide(true)}>
              <Icon name="help" />
            </button>
          </div>
        </nav>
      </div>

      {customizerOpen && (
        <CharacterCustomizer
          appearance={ceoAppearance}
          onChange={setCeoAppearance}
          onClose={() => setCustomizerOpen(false)}
        />
      )}

      <OfficeOverview currentZone={currentZone} compact={Boolean(nearby)} />

      <OfficeMinimap positions={positions} statuses={avatarStatuses} onShowAll={resetZoom} />

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
          <Icon name="minus" size={18} />
        </button>
        <button
          type="button"
          className={styles.zoomLabel}
          onClick={resetZoom}
          title="원래 크기로 (0 키)"
        >
          {zoomPercent}%
        </button>
        <button type="button" className={styles.zoomBtn} onClick={zoomIn} aria-label="확대">
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div className={styles.sidebarDock}>
        <WorkspaceSidebar
          embedded
          onSelectBrief={onSelectBrief}
        />
      </div>
    </div>
  );
}
