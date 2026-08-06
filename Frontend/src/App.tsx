import { useCallback, useState } from 'react';
import { BootingNotice } from '@/components/common/BootingNotice';
import { OfflineNotice } from '@/components/common/OfflineNotice';
import { CeoConsole } from '@/components/console/CeoConsole';
import { TopBar } from '@/components/layout/TopBar';
import { OfficeCanvas } from '@/components/office/OfficeCanvas';
import { OFFICE_HEADCOUNT } from '@/components/office/office-staff';
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

  const isOffline = Boolean(error);

  const handleSelectBrief = useCallback((brief: string) => {
    setPresetBrief(brief);
  }, []);

  const handlePresetConsumed = useCallback(() => {
    setPresetBrief(undefined);
  }, []);

  return (
    <div className={styles.app}>
      <TopBar config={config} agentCount={OFFICE_HEADCOUNT} isOffline={isOffline} />

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
            <OfficeCanvas onSelectBrief={handleSelectBrief} />
            <div
              className={`${styles.consoleDock} ${ceoCollapsed ? styles.consoleDockCollapsed : ''}`}
            >
              <CeoConsole
                isRunning={isRunning}
                isCancelling={isCancelling}
                disabled={agents.length === 0}
                presetBrief={presetBrief}
                followUpFrom={followUpFrom}
                onPresetConsumed={handlePresetConsumed}
                onCollapsedChange={setCeoCollapsed}
                onCancelFollowUp={clearFollowUp}
                onCancel={() => void cancel()}
                onSubmit={(brief) => void submit(brief, followUpFrom ?? undefined)}
              />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
