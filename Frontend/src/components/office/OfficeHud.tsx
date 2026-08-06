import { useEffect, useState } from 'react';
import { CeoConsole } from '@/components/console/CeoConsole';
import { ConversationLog } from '@/components/panels/ConversationLog';
import { DeliverablePanel } from '@/components/panels/DeliverablePanel';
import { VaultPanel } from '@/components/panels/VaultPanel';
import { useSessionStore } from '@/store/session.store';
import styles from './OfficeHud.module.css';

type TabKey = 'log' | 'result' | 'vault';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'log', label: '💬 대화' },
  { key: 'result', label: '📦 산출물' },
  { key: 'vault', label: '📚 볼트' },
];

interface OfficeHudProps {
  isRunning: boolean;
  isCancelling?: boolean;
  disabled: boolean;
  onCancel?: () => void;
  onSubmit: (brief: string) => void;
}

/** 오피스 위에 떠 있는 채팅·입력 HUD */
export function OfficeHud({
  isRunning,
  isCancelling = false,
  disabled,
  onCancel,
  onSubmit,
}: OfficeHudProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('log');
  const [collapsed, setCollapsed] = useState(false);
  const result = useSessionStore((s) => s.result);
  const logCount = useSessionStore((s) => s.logs.length);

  useEffect(() => {
    if (isRunning) setActiveTab('log');
  }, [isRunning]);

  useEffect(() => {
    if (result) setActiveTab('result');
  }, [result]);

  return (
    <div className={styles.hud}>
      <aside
        className={`${styles.chatDock} ${collapsed ? styles.collapsed : ''}`}
        aria-label="사내 대화 패널"
      >
        <header className={styles.dockHeader}>
          <div className={styles.dockTitle}>
            <span className={styles.dockLogo}>MetaHub AI</span>
            <span className={styles.dockSub}>AI for Everyone</span>
          </div>
          <button
            type="button"
            className={styles.collapseBtn}
            aria-label={collapsed ? '패널 펼치기' : '패널 접기'}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '◀' : '▶'}
          </button>
        </header>

        {!collapsed && (
          <>
            <div className={styles.tabs} role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={`${styles.tab} ${activeTab === tab.key ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  {tab.key === 'log' && logCount > 0 && (
                    <span className={styles.badge}>{logCount}</span>
                  )}
                </button>
              ))}
            </div>

            <div className={styles.dockBody} role="tabpanel">
              {activeTab === 'log' && <ConversationLog />}
              {activeTab === 'result' && <DeliverablePanel />}
              {activeTab === 'vault' && <VaultPanel />}
            </div>
          </>
        )}
      </aside>

      <footer className={styles.consoleBar}>
        <CeoConsole
          isRunning={isRunning}
          isCancelling={isCancelling}
          disabled={disabled}
          onCancel={() => onCancel?.()}
          onSubmit={onSubmit}
        />
      </footer>
    </div>
  );
}
