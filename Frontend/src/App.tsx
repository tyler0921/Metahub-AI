import { useCallback, useState } from 'react';
import { BootingNotice } from '@/components/common/BootingNotice';
import { OfflineNotice } from '@/components/common/OfflineNotice';
import { CeoConsole } from '@/components/console/CeoConsole';
import { ProjectStatusBar } from '@/components/layout/ProjectStatusBar';
import { OfficeCanvas } from '@/components/office/OfficeCanvas';
import { DeliverableFocus } from '@/components/panels/DeliverableFocus';
import { useCompanyConfig } from '@/hooks/useCompanyConfig';
import { useCompanySession } from '@/hooks/useCompanySession';
import { useSessionStore } from '@/store/session.store';
import styles from './App.module.css';

export default function App(): React.JSX.Element {
  const { config, error, isWaitingForServer, retry } = useCompanyConfig();
  const { isRunning, isCancelling, submit, cancel } = useCompanySession();
  const agents = useSessionStore((s) => s.agents);
  const followUpFrom = useSessionStore((s) => s.followUpFrom);
  const clearFollowUp = useSessionStore((s) => s.clearFollowUp);
  const [presetBrief, setPresetBrief] = useState<string | undefined>();
  const [ceoCollapsed, setCeoCollapsed] = useState(true);
  /** 오피스에서 "지시하기"를 눌렀을 때 콘솔을 펼치는 신호 */
  const [consoleFocusId, setConsoleFocusId] = useState(0);

  const isOffline = Boolean(error);

  const handleSelectBrief = useCallback((brief: string) => {
    setPresetBrief(brief);
  }, []);

  const handlePresetConsumed = useCallback(() => {
    setPresetBrief(undefined);
  }, []);

  const handleOpenConsole = useCallback(() => {
    setConsoleFocusId((id) => id + 1);
  }, []);

  return (
    <div className={styles.app}>
      {/*
        상단 바가 없습니다 (시안 1c · 최소 크롬).
        세션 상태는 공간 위에 뜨는 알약이, 실행 환경은 좌측 레일 하단이 맡습니다.
      */}
      {isWaitingForServer ? (
        <main className={styles.offlineMain}>
          <BootingNotice />
        </main>
      ) : isOffline ? (
        <main className={styles.offlineMain}>
          <OfflineNotice message={error ?? ''} onRetry={retry} />
        </main>
      ) : (
        <main className={styles.workspace}>
          <div className={styles.officeArea}>
            <ProjectStatusBar />
            <OfficeCanvas
              onSelectBrief={handleSelectBrief}
              onOpenConsole={handleOpenConsole}
              config={config}
            />
            <div
              className={`${styles.consoleDock} ${ceoCollapsed ? styles.consoleDockCollapsed : ''}`}
            >
              <CeoConsole
                isRunning={isRunning}
                isCancelling={isCancelling}
                disabled={agents.length === 0}
                presetBrief={presetBrief}
                followUpFrom={followUpFrom}
                focusRequestId={consoleFocusId}
                onPresetConsumed={handlePresetConsumed}
                onCollapsedChange={setCeoCollapsed}
                onCancelFollowUp={clearFollowUp}
                onCancel={() => void cancel()}
                onSubmit={(brief) => void submit(brief, followUpFrom ?? undefined)}
              />
            </div>
          </div>

          {/* 산출물 집중 모드 — 오피스·콘솔 위를 통째로 덮습니다 */}
          <DeliverableFocus />
        </main>
      )}
    </div>
  );
}
