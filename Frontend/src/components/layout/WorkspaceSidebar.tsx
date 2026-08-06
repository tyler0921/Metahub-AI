import { useEffect, useRef, useState } from 'react';
import { CoPilotPanel } from '@/components/panels/CoPilotPanel';
import { ConversationLog } from '@/components/panels/ConversationLog';
import { DeliverablePanel } from '@/components/panels/DeliverablePanel';
import { VaultPanel } from '@/components/panels/VaultPanel';
import { useSessionStore } from '@/store/session.store';
import styles from './WorkspaceSidebar.module.css';

export type WorkspaceTabKey = 'log' | 'result' | 'vault';

const TABS: ReadonlyArray<{ key: WorkspaceTabKey; label: string }> = [
  { key: 'log', label: '대화' },
  { key: 'result', label: '산출물' },
  { key: 'vault', label: '문서' },
];

interface WorkspaceSidebarProps {
  onSelectBrief: (brief: string) => void;
  embedded?: boolean;
  openTab?: WorkspaceTabKey;
  openRequestId?: number;
}

export function WorkspaceSidebar({
  onSelectBrief,
  embedded = false,
  openTab,
  openRequestId = 0,
}: WorkspaceSidebarProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<WorkspaceTabKey>('log');
  const [drawerOpen, setDrawerOpen] = useState(!embedded);
  const [unreadCount, setUnreadCount] = useState(0);
  const result = useSessionStore((s) => s.result);
  const isRunning = useSessionStore((s) => s.isRunning);
  const agents = useSessionStore((s) => s.agents);
  const logCount = useSessionStore((s) => s.logs.length);
  const workingCount = useSessionStore((s) =>
    [...s.avatars.values()].filter((avatar) =>
      avatar.status === 'thinking' || avatar.status === 'talking',
    ).length,
  );
  const prevLogCount = useRef(logCount);
  const prevRunning = useRef(isRunning);

  useEffect(() => {
    if (isRunning && !prevRunning.current) {
      setActiveTab('log');
      setDrawerOpen(true);
      setUnreadCount(0);
    }
    prevRunning.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (!result) return;
    setActiveTab('result');
    setDrawerOpen(true);
  }, [result]);

  useEffect(() => {
    const added = Math.max(0, logCount - prevLogCount.current);
    if (added > 0) {
      const logIsVisible = drawerOpen && activeTab === 'log';
      setUnreadCount((count) => logIsVisible ? 0 : count + added);
    }
    prevLogCount.current = logCount;
  }, [logCount, drawerOpen, activeTab]);

  useEffect(() => {
    if (!openTab || openRequestId === 0) return;
    setActiveTab(openTab);
    setDrawerOpen(true);
    if (openTab === 'log') setUnreadCount(0);
  }, [openTab, openRequestId]);

  const selectTab = (tab: WorkspaceTabKey): void => {
    setActiveTab(tab);
    if (tab === 'log') setUnreadCount(0);
  };

  if (!drawerOpen) {
    return (
      <aside className={`${styles.drawerClosed} sidebar`} aria-label="활동 패널">
        <button
          type="button"
          className={styles.drawerLauncher}
          aria-label="활동 패널 열기"
          onClick={() => {
            setDrawerOpen(true);
            if (activeTab === 'log') setUnreadCount(0);
          }}
        >
          <span className={styles.launcherIcon} aria-hidden="true">◫</span>
          <span>활동</span>
          {unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
      </aside>
    );
  }

  return (
    <aside className={`${styles.drawer} sidebar`} aria-label="활동 패널">
      <header className={styles.drawerHeader}>
        <div>
          <span className={styles.eyebrow}>PEOPLE & WORK</span>
          <strong>팀 활동</strong>
        </div>
        <div className={styles.headerMeta}>
          <span><i />{isRunning ? `${workingCount}명 작업 중` : `${agents.length}명 온라인`}</span>
          <button type="button" aria-label="활동 패널 닫기" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="업무 보기">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={activeTab === tab.key ? styles.activeTab : ''}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
            {tab.key === 'log' && unreadCount > 0 && <b>{unreadCount}</b>}
          </button>
        ))}
      </div>

      <div className={styles.body} role="tabpanel" data-scroll-root>
        {activeTab === 'log' && <ConversationLog theme="light" />}
        {activeTab === 'result' && <DeliverablePanel theme="light" />}
        {activeTab === 'vault' && <VaultPanel theme="light" />}
      </div>

      <CoPilotPanel
        className={styles.copilot}
        theme="light"
        onSelectBrief={onSelectBrief}
      />
    </aside>
  );
}
