import { useEffect, useMemo, useState } from 'react';
import type { SpeechEvent } from '@shared';
import { WorkspaceSidebar, type WorkspaceTabKey } from '@/components/layout/WorkspaceSidebar';
import { useSessionStore } from '@/store/session.store';
import { ConversationFlow } from './ConversationFlow';
import { NearbyCard } from './NearbyCard';
import { OfficeOverview } from './OfficeOverview';
import { SpeechBubble } from './SpeechBubble';
import { useOfficeRenderer } from './useOfficeRenderer';
import styles from './OfficeCanvas.module.css';

const MAX_BUBBLES = 4;
const SPEECH_VISIBLE_MS = 14_000;

interface OfficeCanvasProps {
  onSelectBrief: (brief: string) => void;
}

export function OfficeCanvas({ onSelectBrief }: OfficeCanvasProps): React.JSX.Element {
  const logs = useSessionStore((s) => s.logs);
  const agentMap = useSessionStore((s) => s.agentMap);
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

  const activeSpeeches = useMemo(() => {
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
        activeSpeeches.flatMap((speech) =>
          speech.to ? [speech.agent, speech.to] : [speech.agent],
        ),
      ),
    ],
    [activeSpeeches],
  );

  const {
    canvasRef,
    stageRef,
    anchors,
    nearby,
    currentZone,
    isLoading,
    error,
    zoomPercent,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useOfficeRenderer(anchorIds);

  const openPanel = (tab: WorkspaceTabKey): void => {
    setPanelRequest((request) => ({ tab, id: request.id + 1 }));
  };

  const handleZoneInteraction = (): void => {
    if (!currentZone) return;
    if (currentZone.id === 'reception') {
      openPanel('vault');
      return;
    }
    if (currentZone.kind === 'meeting') {
      onSelectBrief('현재 안건을 회의실에서 관련 부서들이 함께 검토하고 결론을 보고해줘.');
      return;
    }
    if (currentZone.kind === 'department') {
      onSelectBrief(`${currentZone.label}에 다음 업무를 요청할게: `);
    }
  };

  useEffect(() => {
    setInteractionOpen(false);
  }, [nearby?.agentId]);

  useEffect(() => {
    if (!showGuide) return;
    const timer = window.setTimeout(() => {
      setShowGuide(false);
      window.localStorage.setItem('metahub-office-guide-seen', '1');
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [showGuide]);

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
        if (nearby) setInteractionOpen(true);
        else handleZoneInteraction();
      }
    };
    window.addEventListener('keydown', handleInteraction);
    return () => window.removeEventListener('keydown', handleInteraction);
  }, [nearby, currentZone]);

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
          onSelectBrief={handleAgentBrief}
        />
      )}

      {!nearby && currentZone && ['reception', 'meeting', 'department'].includes(currentZone.kind) && (
        <button type="button" className={styles.zoneAction} onClick={handleZoneInteraction}>
          <kbd>F</kbd>
          <span>
            <b>{currentZone.label}</b>
            {currentZone.id === 'reception'
              ? 'Vault 열기'
              : currentZone.kind === 'meeting'
                ? '협업 회의 시작'
                : '부서에 업무 요청'}
          </span>
        </button>
      )}

      {showGuide && !isLoading && !error && (
        <section className={styles.guide} aria-label="오피스 이동 안내">
          <div className={styles.guideAvatar} aria-hidden="true">👋</div>
          <div>
            <strong>MetaHub 오피스에 오신 것을 환영합니다</strong>
            <p><kbd>WASD</kbd> 또는 클릭으로 이동하고, 직원 곁에서 <kbd>F</kbd>를 눌러보세요.</p>
          </div>
          <button type="button" onClick={dismissGuide} aria-label="안내 닫기">✕</button>
        </section>
      )}

      <nav className={styles.spaceRail} aria-label="공간 메뉴">
        <div className={styles.railLogo} aria-label="MetaHub AI">M</div>
        <div className={styles.railGroup}>
          <button type="button" className={styles.railActive} aria-label="오피스 보기" data-label="오피스" onClick={resetZoom}>
            <span aria-hidden="true">⌂</span>
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
          <button type="button" aria-label="이동 도움말" data-label="도움말" onClick={() => setShowGuide(true)}>
            <span aria-hidden="true">?</span>
          </button>
        </div>
      </nav>

      <OfficeOverview currentZone={currentZone} compact={Boolean(nearby)} />

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
