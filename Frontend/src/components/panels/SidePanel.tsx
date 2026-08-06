import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session.store';
import { ConversationLog } from './ConversationLog';
import { DeliverablePanel } from './DeliverablePanel';
import { VaultPanel } from './VaultPanel';
import styles from './SidePanel.module.css';

type TabKey = 'log' | 'result' | 'vault';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'log', label: '💬 사내 대화' },
  { key: 'result', label: '📦 산출물' },
  { key: 'vault', label: '📚 볼트' },
];

export function SidePanel(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabKey>('log');
  const result = useSessionStore((s) => s.result);
  const isRunning = useSessionStore((s) => s.isRunning);

  // 작업이 시작되면 대화 탭으로, 산출물이 나오면 산출물 탭으로 자동 전환
  useEffect(() => {
    if (isRunning) setActiveTab('log');
  }, [isRunning]);

  useEffect(() => {
    if (result) setActiveTab('result');
  }, [result]);

  return (
    <section className={styles.panel}>
      <div className={styles.tabs} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.body} role="tabpanel">
        {activeTab === 'log' && <ConversationLog />}
        {activeTab === 'result' && <DeliverablePanel />}
        {activeTab === 'vault' && <VaultPanel />}
      </div>
    </section>
  );
}
